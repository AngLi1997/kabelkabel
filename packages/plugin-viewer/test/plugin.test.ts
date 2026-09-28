import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { groupImages, pagePosition, VIEWER_SERVICE, viewerActions, viewerPlugin, type UrlFactory } from '../src';

const urls = (): UrlFactory & { revoked: string[] } => {
  let n = 0;
  const revoked: string[] = [];
  return { create: () => `blob:${++n}`, revoke: (u) => void revoked.push(u), revoked };
};

describe('viewerPlugin', () => {
  it('初始化影像并提供翻页、缩放命令', async () => {
    const { kernel, panels } = await setupPlugins(viewerPlugin({ images: ['/1.jpg', '/2.jpg', '/3.jpg'] }));
    await vi.waitFor(() => expect(kernel.getState().viewer.images).toHaveLength(3));
    expect(panels()[0]!.region).toBe('main');
    expect(kernel.commands.isEnabled('viewer.prev')).toBe(false);
    await kernel.execute('viewer.next');
    await kernel.execute('viewer.next');
    await kernel.execute('viewer.next');
    expect(kernel.getState().viewer.index).toBe(2);
    await kernel.execute('viewer.zoomIn');
    expect(kernel.getState().viewer.zoom).toBeCloseTo(1.25);
    await kernel.execute('viewer.rotateLeft');
    expect(kernel.getState().viewer.rotation).toBe(270);
    await kernel.execute('viewer.goto', 0);
    expect(kernel.getState().viewer).toMatchObject({ index: 0, zoom: 'fit', rotation: 0 });
  });

  it('支持异步加载器，并在替换时释放 object URL', async () => {
    const factory = urls();
    const { kernel } = await setupPlugins(viewerPlugin({ urlFactory: factory }));
    const service = kernel.services.get(VIEWER_SERVICE);
    await service.setImages([new Blob(['a']), () => Promise.resolve(new Blob(['b']))]);
    expect(service.getImages().map((i) => i.src)).toEqual(['blob:1', 'blob:2']);
    await service.setImages(['/x.jpg']);
    expect(factory.revoked).toEqual(['blob:1', 'blob:2']);
    kernel.unuse('kabel:viewer');
  });

  it('并发 setImages 以最后一次为准', async () => {
    const { kernel } = await setupPlugins(viewerPlugin());
    const service = kernel.services.get(VIEWER_SERVICE);
    const slow = service.setImages([() => new Promise((r) => setTimeout(() => r('/slow.jpg'), 20))]);
    await service.setImages(['/fast.jpg']);
    await slow;
    expect(service.getImages().map((i) => i.src)).toEqual(['/fast.jpg']);
  });

  it('派发 viewer:change 事件', async () => {
    const { kernel } = await setupPlugins(viewerPlugin());
    const onChange = vi.fn();
    kernel.bus.on('viewer:change', onChange);
    await kernel.services.get(VIEWER_SERVICE).setImages(['/a.jpg', '/b.jpg']);
    kernel.dispatch(viewerActions.next());
    expect(onChange).toHaveBeenLastCalledWith({ index: 1, image: expect.objectContaining({ src: '/b.jpg' }) });
  });

  it('缩放比例有上下限', async () => {
    const { kernel } = await setupPlugins(viewerPlugin());
    kernel.dispatch(viewerActions.setZoom(100));
    expect(kernel.getState().viewer.zoom).toBe(8);
    kernel.dispatch(viewerActions.setZoom(0.001));
    expect(kernel.getState().viewer.zoom).toBe(0.1);
  });
});

describe('影像目录', () => {
  it('按目录分组并计算页码位置', async () => {
    const { kernel } = await setupPlugins(viewerPlugin());
    await kernel.services.get(VIEWER_SERVICE).setImages([
      { url: '/1.jpg', group: '正文' },
      { url: '/2.jpg', group: '正文' },
      { url: '/3.jpg', group: '附件' },
    ]);
    const v = kernel.getState().viewer;
    expect(groupImages(v.images).map((g) => [g.name, g.start, g.items.length])).toEqual([
      ['正文', 0, 2],
      ['附件', 2, 1],
    ]);
    await kernel.execute('viewer.goto', 2);
    expect(pagePosition(kernel.getState().viewer)).toEqual({ total: 3, page: 3, group: '附件', groupPage: 1, groupTotal: 1 });
  });
});
