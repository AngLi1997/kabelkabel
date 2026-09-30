import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  documentPosition,
  groupDocuments,
  stageActions,
  WORKSPACE_SERVICE,
  WorkspaceExtensions,
  workspacePlugin,
  type UrlFactory,
  type WorkspacePluginOptions,
} from '../src';

const urls = (): UrlFactory & { revoked: string[] } => {
  let n = 0;
  const revoked: string[] = [];
  return { create: () => `blob:${++n}`, revoke: (u) => void revoked.push(u), revoked };
};

const setup = (options: WorkspacePluginOptions = {}) => setupPlugins(workspacePlugin(options));

describe('workspacePlugin', () => {
  it('贡献文件目录（左）、内容面板（中）与 image 渲染器；directory: false 时不注册目录', async () => {
    const { kernel, panels } = await setup();
    expect(panels().map((p) => [p.id, p.region])).toEqual([
      ['workspace.files', 'left'],
      ['workspace.content', 'main'],
    ]);
    const [renderer] = kernel.extensions.get(WorkspaceExtensions.renderers).getAll();
    expect(renderer!.id).toBe('workspace.image');
    expect(renderer!.match({ id: '1', name: 'a', kind: 'image', src: '/a.jpg' })).toBe(true);
    expect(renderer!.match({ id: '2', name: 'b', kind: 'pdf', src: '/b.pdf' })).toBe(false);

    const off = await setup({ directory: false });
    expect(off.panels().map((p) => p.id)).toEqual(['workspace.content']);
    const moved = await setup({ directory: { region: 'right', title: '文件' } });
    expect(moved.panels().find((p) => p.id === 'workspace.files')).toMatchObject({ region: 'right', title: '文件' });
  });

  it('初始化影像并提供翻页、缩放命令', async () => {
    const { kernel } = await setup({ images: ['/1.jpg', '/2.jpg', '/3.jpg'] });
    await vi.waitFor(() => expect(kernel.getState().documents.items).toHaveLength(3));
    expect(kernel.commands.isEnabled('workspace.prev')).toBe(false);
    await kernel.execute('workspace.next');
    await kernel.execute('workspace.next');
    await kernel.execute('workspace.next');
    expect(kernel.getState().documents.index).toBe(2);
    await kernel.execute('workspace.zoomIn');
    expect(kernel.getState().stage.zoom).toBeCloseTo(1.25);
    await kernel.execute('workspace.rotateLeft');
    expect(kernel.getState().stage.rotation).toBe(270);
    await kernel.execute('workspace.goto', 0);
    expect(kernel.getState().documents.index).toBe(0);
    expect(kernel.getState().stage).toMatchObject({ zoom: 'fit', rotation: 0 });
  });

  it('舞台命令仅在当前文件是影像时可用', async () => {
    const { kernel } = await setup({ items: [{ id: 'p', name: 'a.pdf', kind: 'pdf', src: '/a.pdf' }] });
    expect(kernel.commands.isEnabled('workspace.zoomIn')).toBe(false);
    await kernel.services.get(WORKSPACE_SERVICE).setImages(['/a.jpg']);
    expect(kernel.commands.isEnabled('workspace.zoomIn')).toBe(true);
  });

  it('支持异步加载器，并在替换时释放 object URL', async () => {
    const factory = urls();
    const { kernel } = await setup({ urlFactory: factory });
    const service = kernel.services.get(WORKSPACE_SERVICE);
    await service.setImages([new Blob(['a']), () => Promise.resolve(new Blob(['b']))]);
    expect(service.getImages().map((i) => i.src)).toEqual(['blob:1', 'blob:2']);
    await service.setImages(['/x.jpg']);
    expect(factory.revoked).toEqual(['blob:1', 'blob:2']);
    kernel.unuse('kabel:workspace');
  });

  it('并发 setImages 以最后一次为准；setDocuments 使未完成的加载失效', async () => {
    const { kernel } = await setup();
    const service = kernel.services.get(WORKSPACE_SERVICE);
    const slow = service.setImages([() => new Promise((r) => setTimeout(() => r('/slow.jpg'), 20))]);
    await service.setImages(['/fast.jpg']);
    await slow;
    expect(service.getImages().map((i) => i.src)).toEqual(['/fast.jpg']);

    const late = service.setImages([() => new Promise((r) => setTimeout(() => r('/late.jpg'), 20))]);
    service.setDocuments([{ id: 'p', name: 'a.pdf', kind: 'pdf', src: '/a.pdf' }]);
    await late;
    expect(service.getDocuments().map((d) => d.name)).toEqual(['a.pdf']);
    expect(service.current()?.kind).toBe('pdf');
  });

  it('切换文件时恢复缩放与旋转，并派发 document:change', async () => {
    const { kernel } = await setup();
    const onChange = vi.fn();
    kernel.bus.on('document:change', onChange);
    await kernel.services.get(WORKSPACE_SERVICE).setImages(['/a.jpg', '/b.jpg']);
    kernel.dispatch(stageActions.rotate(90));
    await kernel.execute('workspace.next');
    expect(kernel.getState().stage.rotation).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith({ index: 1, document: expect.objectContaining({ src: '/b.jpg', kind: 'image' }) });
  });

  it('缩放比例有上下限', async () => {
    const { kernel } = await setup();
    kernel.dispatch(stageActions.setZoom(100));
    expect(kernel.getState().stage.zoom).toBe(8);
    kernel.dispatch(stageActions.setZoom(0.001));
    expect(kernel.getState().stage.zoom).toBe(0.1);
  });
});

describe('文件目录', () => {
  it('按目录分组并计算位置', async () => {
    const { kernel } = await setup();
    await kernel.services.get(WORKSPACE_SERVICE).setImages([
      { url: '/1.jpg', group: '正文' },
      { url: '/2.jpg', group: '正文' },
      { url: '/3.jpg', group: '附件' },
    ]);
    const d = kernel.getState().documents;
    expect(groupDocuments(d.items).map((g) => [g.name, g.start, g.items.length])).toEqual([
      ['正文', 0, 2],
      ['附件', 2, 1],
    ]);
    await kernel.execute('workspace.goto', 2);
    expect(documentPosition(kernel.getState().documents)).toEqual({ total: 3, page: 3, group: '附件', groupPage: 1, groupTotal: 1 });
  });
});
