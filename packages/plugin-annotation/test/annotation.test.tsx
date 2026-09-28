import { historyPlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { VIEWER_SERVICE, viewerPlugin, type ViewerOverlayProps } from '@kabel/plugin-viewer';
import { KernelContext, layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANNOTATION_SERVICE,
  annotationActions,
  annotationPlugin,
  AnnotationOverlay,
  annotatorActions,
  createZip,
  toYolo,
  type AnnotationDocument,
} from '../src';

async function setup() {
  const result = await setupPlugins([
    layoutPlugin(),
    historyPlugin(),
    viewerPlugin({ images: [{ url: '/1.png', name: '0001.png' }, '/2.png'] }),
    annotationPlugin({ labels: ['题名', { name: '印章', color: '#c00' }] }),
  ]);
  await vi.waitFor(() => expect(result.kernel.getState().viewer.images).toHaveLength(2));
  return result;
}

const box = (id: string, label: string, x = 10, y = 20, w = 100, h = 50) => ({ id, label, x, y, w, h });

let host: HTMLElement | undefined;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = undefined;
});

describe('annotationPlugin', () => {
  it('数字键切换标记类型，选中标记时同时修改其类型', async () => {
    const { kernel } = await setup();
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host!));
    const press = (key: string, target: EventTarget = host!.querySelector('.kb-root')!) =>
      act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));

    press('2');
    expect(kernel.getState().annotator.active).toBe('印章');
    expect(host.querySelector('.kb-labelbar__item.is-active')!.textContent).toContain('印章');

    kernel.dispatch(annotationActions.add({ imageId: 'image-2', annotation: box('b1', '印章') }));
    await kernel.execute('viewer.next');
    act(() => kernel.dispatch(annotatorActions.select('b1')));
    press('1');
    expect(kernel.getState().annotations['image-2']![0]!.label).toBe('题名');

    press('Delete');
    expect(kernel.getState().annotations['image-2']).toBeUndefined();
    kernel.history.undo();
    expect(kernel.getState().annotations['image-2']).toHaveLength(1);
  });

  it('输入框内的数字键不切换类型', async () => {
    const { kernel } = await setup();
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host!));
    const input = document.createElement('input');
    host.querySelector('.kb-root')!.appendChild(input);
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true })));
    expect(kernel.getState().annotator.active).toBe('题名');
  });

  it('影像上拖拽新建标记，拖动标记移动', async () => {
    const { kernel } = await setup();
    const image = kernel.getState().viewer.images[0]!;
    const props: ViewerOverlayProps = {
      kernel,
      image,
      width: 600,
      height: 800,
      scale: 1,
      rotation: 0,
      toScreen: (x, y) => ({ x, y }),
      toImage: (x, y) => ({ x, y }),
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() =>
      render(
        <KernelContext.Provider value={kernel}>
          <AnnotationOverlay {...props} />
        </KernelContext.Provider>,
        host!,
      ),
    );
    const pointer = (target: Element, type: string, x: number, y: number) =>
      act(() => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 })));
    const layer = host.querySelector('.kb-anno')!;
    pointer(layer, 'pointerdown', 50, 60);
    pointer(layer, 'pointermove', 250.4, 160);
    pointer(layer, 'pointerup', 250.4, 160);
    const [created] = kernel.getState().annotations[image.id]!;
    expect(created).toMatchObject({ label: '题名', x: 50, y: 60, w: 200, h: 100 });
    expect(kernel.getState().annotator.sizes[image.id]).toEqual({ width: 600, height: 800 });

    const el = host.querySelector('.kb-anno__box')!;
    pointer(el, 'pointerdown', 100, 100);
    pointer(el, 'pointermove', 110, 90);
    pointer(el, 'pointerup', 110, 90);
    expect(kernel.getState().annotator.selected).toBe(created!.id);
    expect(kernel.getState().annotations[image.id]![0]).toMatchObject({ x: 60, y: 50, w: 200, h: 100 });

    // 过小的拖拽不创建标记
    pointer(layer, 'pointerdown', 300, 300);
    pointer(layer, 'pointerup', 302, 302);
    expect(kernel.getState().annotations[image.id]).toHaveLength(1);
  });

  it('导出 JSON / YOLO，载入标记；切换影像时清空', async () => {
    const { kernel } = await setup();
    const service = kernel.services.get(ANNOTATION_SERVICE);
    kernel.dispatch(annotatorActions.setSize({ imageId: 'image-1', size: { width: 200, height: 400 } }));
    kernel.dispatch(annotationActions.add({ imageId: 'image-1', annotation: box('b1', '印章', 50, 100, 100, 200) }));

    const doc = service.exportJson();
    expect(doc.images[0]).toEqual({
      id: 'image-1',
      name: '0001.png',
      width: 200,
      height: 400,
      annotations: [{ id: 'b1', label: '印章', bbox: [50, 100, 100, 200] }],
    });
    expect(doc.images[1]).toMatchObject({ id: 'image-2', annotations: [] });

    const yolo = service.exportYolo();
    expect(yolo['classes.txt']).toBe('题名\n印章\n');
    expect(yolo['labels/0001.txt']).toBe('1 0.5 0.5 0.5 0.5\n');
    expect(yolo['labels/2.txt']).toBe('');
    expect(yolo['data.yaml']).toContain('1: "印章"');

    await kernel.services.get(VIEWER_SERVICE).setImages(['/3.png']);
    expect(kernel.getState().annotations).toEqual({});

    // 影像加载中提交的标记在影像就绪后载入
    const next: AnnotationDocument = {
      labels: [],
      images: [{ id: 'image-1', width: 10, height: 10, annotations: [{ label: '题名', bbox: [1, 2, 3, 4] }, { label: '未知', bbox: [0, 0, 1, 1] }] }],
    };
    const loading = kernel.services.get(VIEWER_SERVICE).setImages([() => Promise.resolve('/4.png')]);
    service.setAnnotations(next);
    await loading;
    expect(kernel.getState().annotations['image-1']).toEqual([expect.objectContaining({ label: '题名', x: 1, y: 2, w: 3, h: 4 })]);
  });

  it('YOLO 跳过尺寸未知且有标记的图片；zip 结构正确', () => {
    const files = toYolo({ a: [box('1', 'x')] }, [{ id: 'x', name: 'x', color: '#000' }], [{ id: 'a', name: 'a.jpg' }], {});
    expect(Object.keys(files)).toEqual(['classes.txt', 'data.yaml']);
    const zip = createZip({ '标签.txt': 'abc' });
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint32(14, true)).toBe(0x352441c2); // crc32("abc")
  });
});
