import { createTestKernel } from '@kabel/core/testing';
import { WORKSPACE_SERVICE, workspacePlugin } from '@kabel/plugin-workspace';
import { describe, expect, it, vi } from 'vitest';
import { FILE_LOADER_SERVICE, fileLoaderPlugin, listMinioEntries, parseUrlList, presignUrl, selectImages, urlEntries } from '../src';

describe('presignUrl', () => {
  it('与 AWS 文档中的预签名 GET 示例一致', async () => {
    const url = await presignUrl('https://examplebucket.s3.amazonaws.com/test.txt', {
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expires: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});

describe('URL 列表', () => {
  it('按换行/逗号分隔，去空白、重复与注释', () => {
    expect(parseUrlList('a.jpg, b.jpg\n\n# c\n a.jpg ;d.jpg')).toEqual(['a.jpg', 'b.jpg', 'd.jpg']);
    expect(urlEntries(['https://x/y/%E9%A1%B5%201.png?v=1'])[0]!.name).toBe('页 1.png');
  });
});

describe('影像过滤与排序', () => {
  it('过滤非影像并自然排序', () => {
    const { images, skipped } = selectImages([{ name: '10.jpg' }, { name: '2.jpg' }, { name: 'a.pdf' }, { name: 'b.PNG', group: 'x' }]);
    expect(images.map((i) => i.name)).toEqual(['2.jpg', '10.jpg', 'b.PNG']);
    expect(skipped).toBe(1);
  });
});

const listXml = (keys: string[], next?: string) =>
  `<?xml version="1.0"?><ListBucketResult><IsTruncated>${!!next}</IsTruncated>${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ''}${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`;

describe('listMinioEntries', () => {
  it('分页列出并按前缀生成分组与地址', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const paged = String(input).includes('continuation-token');
      return new Response(paged ? listXml(['case/sub/2.png']) : listXml(['case/', 'case/1.jpg'], 'tok'));
    }) as unknown as typeof fetch;
    const entries = await listMinioEntries({ endpoint: 'http://m:9000/', bucket: 'b', prefix: '/case' }, { fetch: fetcher });
    expect(entries.map((e) => [e.name, e.group, e.url])).toEqual([
      ['1.jpg', undefined, 'http://m:9000/b/case/1.jpg'],
      ['2.png', 'sub', 'http://m:9000/b/case/sub/2.png'],
    ]);
    expect(calls[0]).toContain('prefix=case%2F');
    expect(calls[1]).toContain('continuation-token=tok');
  });

  it('提供密钥时地址带预签名参数；服务端报错时给出原因', async () => {
    const ok = vi.fn(async () => new Response(listXml(['a.jpg']))) as unknown as typeof fetch;
    const [entry] = await listMinioEntries({ endpoint: 'http://m', bucket: 'b', accessKey: 'ak', secretKey: 'sk' }, { fetch: ok });
    expect(entry!.url).toMatch(/X-Amz-Signature=[0-9a-f]{64}/);
    const bad = vi.fn(async () => new Response('<Error><Message>Access Denied</Message></Error>', { status: 403 })) as unknown as typeof fetch;
    await expect(listMinioEntries({ endpoint: 'http://m', bucket: 'b' }, { fetch: bad })).rejects.toThrow('Access Denied');
  });
});

describe('fileLoaderPlugin', () => {
  const setup = async () => {
    const kernel = createTestKernel({
      plugins: [workspacePlugin({ urlFactory: { create: (b) => `blob:${(b as File).name}`, revoke: () => {} } }), fileLoaderPlugin()],
    });
    await vi.waitFor(() => expect(kernel.services.has(FILE_LOADER_SERVICE)).toBe(true));
    return { kernel, loader: kernel.services.get(FILE_LOADER_SERVICE), workspace: kernel.services.get(WORKSPACE_SERVICE) };
  };

  it('URL 列表加载后写入工作台影像', async () => {
    const { kernel, loader, workspace } = await setup();
    const onLoad = vi.fn();
    kernel.bus.on('file-loader:load', onLoad);
    const result = await loader.loadUrls('https://x/2.jpg\nhttps://x/1.jpg');
    expect(result).toEqual({ source: 'urls', loaded: 2, skipped: 0 });
    expect(workspace.getImages().map((i) => i.name)).toEqual(['1.jpg', '2.jpg']);
    expect(workspace.getImages()[0]!.src).toBe('https://x/1.jpg');
    expect(onLoad).toHaveBeenCalledWith(result);
    expect(kernel.getState().fileLoader.busy).toBe(false);
  });

  it('本地文件按相对目录分组，跳过非影像', async () => {
    const { loader, workspace } = await setup();
    const file = (name: string, path: string, type: string) => Object.defineProperty(new File(['x'], name, { type }), 'webkitRelativePath', { value: path });
    const result = await loader.loadFiles([file('a.png', 'root/正文/a.png', 'image/png'), file('n.pdf', 'root/n.pdf', 'application/pdf'), file('c.jpg', 'root/c.jpg', 'image/jpeg')]);
    expect(result).toMatchObject({ loaded: 2, skipped: 1 });
    expect(workspace.getImages().map((i) => [i.name, i.group])).toEqual([
      ['c.jpg', undefined],
      ['a.png', '正文'],
    ]);
  });

  it('空列表报错并提示，忙碌状态复位', async () => {
    const { kernel, loader } = await setup();
    await expect(loader.loadUrls('  \n')).rejects.toThrow('至少一个 URL');
    expect(kernel.getState().fileLoader.busy).toBe(false);
  });
});
