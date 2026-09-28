import { describe, expect, it } from 'vitest';
import { base64ToDataUrl, isRawBase64, resolveImage, sniffBase64Mime, sniffBytesMime, type UrlFactory } from '../src';

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function fakeUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const factory: UrlFactory = {
    create: (blob) => {
      created.push(blob);
      return `blob:fake/${created.length}`;
    },
    revoke: (url) => void revoked.push(url),
  };
  return { factory, created, revoked };
}

describe('图片源识别', () => {
  it('区分 URL 与纯 base64', () => {
    expect(isRawBase64('https://example.com/a.jpg')).toBe(false);
    expect(isRawBase64('/files/a.jpg')).toBe(false);
    expect(isRawBase64('data:image/png;base64,xxx')).toBe(false);
    expect(isRawBase64(PNG_1PX)).toBe(true);
  });

  it('根据 base64 头识别 MIME', () => {
    expect(sniffBase64Mime(PNG_1PX)).toBe('image/png');
    expect(sniffBase64Mime('/9j/4AAQSkZJRg')).toBe('image/jpeg');
    expect(base64ToDataUrl(PNG_1PX)).toBe(`data:image/png;base64,${PNG_1PX}`);
  });

  it('根据字节头识别 MIME', () => {
    expect(sniffBytesMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffBytesMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
  });
});

describe('resolveImage', () => {
  it('URL 字符串', () => {
    const { item, objectUrls } = resolveImage('https://cdn.example.com/scan/0001.jpg?x=1', 0);
    expect(item).toMatchObject({ id: 'image-1', name: '0001.jpg', src: 'https://cdn.example.com/scan/0001.jpg?x=1' });
    expect(objectUrls).toEqual([]);
  });

  it('纯 base64 字符串转为 data URL', () => {
    expect(resolveImage(PNG_1PX, 1).item).toMatchObject({ src: `data:image/png;base64,${PNG_1PX}`, name: '第 2 页' });
  });

  it('Blob / ArrayBuffer 创建 object URL', () => {
    const { factory, created } = fakeUrls();
    const a = resolveImage(new Blob(['x'], { type: 'image/png' }), 0, factory);
    const b = resolveImage(new Uint8Array([0xff, 0xd8, 0xff]).buffer, 1, factory);
    expect(a.item.src).toBe('blob:fake/1');
    expect(b.objectUrls).toEqual(['blob:fake/2']);
    expect(created[1]!.type).toBe('image/jpeg');
  });

  it('对象形式：url / base64 / data / 缩略图', () => {
    const { factory } = fakeUrls();
    expect(resolveImage({ id: 'p1', url: '/a.jpg', name: '封面', thumbnail: '/a_s.jpg' }, 0).item).toEqual({
      id: 'p1',
      name: '封面',
      src: '/a.jpg',
      thumbnail: '/a_s.jpg',
    });
    expect(resolveImage({ base64: PNG_1PX, mime: 'image/png' }, 0).item.src.startsWith('data:image/png')).toBe(true);
    expect(resolveImage({ data: new Uint8Array([1, 2]), mime: 'image/tiff' }, 0, factory).item.src).toBe('blob:fake/1');
  });

  it('缺少来源时报错', () => {
    expect(() => resolveImage({ name: 'x' }, 0)).toThrow(/no source/);
  });
});
