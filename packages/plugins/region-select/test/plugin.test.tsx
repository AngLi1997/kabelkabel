import { definePlugin, ExtensionPoints, historyPlugin, NOTIFY_SERVICE } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { WORKSPACE_SERVICE, workspacePlugin } from '@kabel/plugin-workspace';
import { contextMenuPlugin, feedbackPlugin, layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contributeShape,
  REGION_CROPPER,
  REGION_SERVICE,
  regionSelectPlugin,
  type CropRequest,
  type RegionCropper,
  type RegionSelection,
  type RegionSelectOptions,
} from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.restoreAllMocks();
});
beforeEach(() => {
  // happy-dom 不做布局：固定舞台 800×600
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
});

// 图片 1000×800，舞台 800×600 时适应窗口比例为 0.72，图片中心对齐舞台中心
const SCALE = 0.72;
const px = (x: number, y: number) => ({ clientX: 400 + (x - 500) * SCALE, clientY: 300 + (y - 400) * SCALE });

function fakeCropper() {
  const requests: CropRequest[] = [];
  const cropper: RegionCropper = {
    original: async () => new Blob(['original']),
    crop: async (request) => {
      requests.push(request);
      return { blob: new Blob(['crop']), mime: request.options.mime ?? 'image/png', width: request.bbox.width, height: request.bbox.height };
    },
  };
  return { cropper, requests };
}

async function mount(options: RegionSelectOptions = {}, extra?: Parameters<typeof definePlugin>[0]) {
  const kernel = createTestKernel({
    plugins: [
      layoutPlugin({ persist: false }),
      historyPlugin(),
      feedbackPlugin(),
      contextMenuPlugin(),
      workspacePlugin({ items: [{ id: 'a', name: 'a.jpg', kind: 'image', src: '/a.jpg' }] }),
      regionSelectPlugin(options),
      extra,
    ],
  });
  await vi.waitFor(() => expect(kernel.services.has(REGION_SERVICE)).toBe(true));
  const fake = fakeCropper();
  kernel.services.provide(REGION_CROPPER, fake.cropper);
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  const img = host.querySelector('.kb-stage__image') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: 1000 });
  Object.defineProperty(img, 'naturalHeight', { value: 800 });
  // happy-dom 的 img 没有 onload 属性，Preact 注册的是 `Load`，两种都触发
  act(() => void ['load', 'Load'].forEach((type) => img.dispatchEvent(new Event(type))));
  const selections: RegionSelection[] = [];
  kernel.bus.on('region:select', (e) => void selections.push(e));
  return { kernel, selections, ...fake };
}

// 命令执行后需要等 Preact 重新渲染，覆盖层才会收到最新的 interactive
const run = (kernel: { execute(id: string): Promise<unknown> }, id: string) => act(async () => void (await kernel.execute(id)));
const pointer = (type: string, init: PointerEventInit) => {
  const layer = host.querySelector('.kb-rsel')!;
  act(() => void layer.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })));
};
const click = (x: number, y: number, extra: PointerEventInit = {}) => {
  pointer('pointerdown', { button: 0, ...px(x, y), ...extra });
  pointer('pointerup', { button: 0, ...px(x, y), ...extra });
};
const dragRect = (a: [number, number], b: [number, number], extra: PointerEventInit = {}) => {
  pointer('pointerdown', { button: 0, ...px(...a), ...extra });
  pointer('pointermove', { ...px(...b), ...extra });
  pointer('pointerup', { button: 0, ...px(...b), ...extra });
};

describe('框选插件', () => {
  it('贡献矩形 / 多边形工具按钮与命令；未激活时覆盖层不拦截指针', async () => {
    const { kernel } = await mount();
    expect([...host.querySelectorAll('.kb-stage__bar button')].map((b) => b.getAttribute('title'))).toEqual(
      expect.arrayContaining(['矩形框选', '多边形框选']),
    );
    expect(kernel.commands.has('regionSelect.tool.rect')).toBe(true);
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(false);
  });

  it('激活后占用舞台；再次执行同一命令退出；切换形状互斥', async () => {
    const { kernel } = await mount();
    await run(kernel, 'regionSelect.tool.rect');
    expect(kernel.getState().stage.tool?.id).toBe('kabel:region-select');
    expect(kernel.getState().regionSelect.tool).toBe('rect');
    expect(kernel.commands.isChecked('regionSelect.tool.rect')).toBe(true);
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(true);

    await run(kernel, 'regionSelect.tool.polygon');
    expect(kernel.getState().regionSelect.tool).toBe('polygon');
    expect(kernel.getState().stage.tool?.id).toBe('kabel:region-select');

    await run(kernel, 'regionSelect.tool.polygon');
    expect(kernel.getState().regionSelect.tool).toBeNull();
    expect(kernel.getState().stage.tool).toBeNull();
  });

  it('矩形框选：事件里直接带原图 Blob、裁剪图 Blob 与 bbox，完成后自动退出', async () => {
    const { kernel, selections, requests } = await mount();
    await run(kernel, 'regionSelect.tool.rect');
    dragRect([100, 100], [300, 250]);
    await vi.waitFor(() => expect(selections).toHaveLength(1));

    const [sel] = selections;
    expect(sel).toMatchObject({ origin: 'user', document: { id: 'a' }, shape: { type: 'rect' } });
    expect(sel!.bbox).toEqual({ x: 100, y: 100, width: 200, height: 150 });
    expect(await sel!.original.text()).toBe('original');
    expect(sel!.crop).toMatchObject({ width: 200, height: 150, bbox: { x: 100, y: 100, width: 200, height: 150 } });
    expect(await sel!.crop!.blob.text()).toBe('crop');
    expect(sel!.crop!.localShape).toEqual({ type: 'rect', x: 0, y: 0, width: 200, height: 150 });
    expect(requests[0]).toMatchObject({ mode: 'bbox', options: {} });
    expect(kernel.getState().regionSelect.last).toMatchObject({ id: sel!.id, documentId: 'a' });
    expect(kernel.getState().stage.tool).toBeNull();
  });

  it('autoExit: false 时保持激活；Shift + 拖动得到正方形；过小的框视为误触', async () => {
    const { kernel, selections } = await mount({ autoExit: false });
    await run(kernel, 'regionSelect.tool.rect');
    dragRect([100, 100], [400, 200], { shiftKey: true });
    await vi.waitFor(() => expect(selections).toHaveLength(1));
    expect(selections[0]!.bbox).toMatchObject({ width: 300, height: 300 });
    expect(kernel.getState().regionSelect.tool).toBe('rect');

    dragRect([500, 500], [501, 501]);
    await Promise.resolve();
    expect(selections).toHaveLength(1);
  });

  it('多边形：逐点点击后双击闭合，裁剪按形状裁（clip），localShape 相对裁剪图', async () => {
    const { kernel, selections, requests } = await mount();
    await run(kernel, 'regionSelect.tool.polygon');
    click(100, 100);
    click(300, 100);
    click(200, 300);
    expect(kernel.getState().regionSelect.draft).toMatchObject({ type: 'polygon' });
    await run(kernel, 'regionSelect.confirm');
    await vi.waitFor(() => expect(selections).toHaveLength(1));

    expect(selections[0]!.shape.type).toBe('polygon');
    expect(selections[0]!.bbox).toEqual({ x: 100, y: 100, width: 200, height: 200 });
    expect(requests[0]!.mode).toBe('clip');
    const calls: string[] = [];
    requests[0]!.clip!({
      beginPath: () => void calls.push('begin'),
      moveTo: (x, y) => void calls.push(`M${Math.round(x)},${Math.round(y)}`),
      lineTo: (x, y) => void calls.push(`L${Math.round(x)},${Math.round(y)}`),
      arc: () => {},
      closePath: () => void calls.push('close'),
    });
    expect(calls).toEqual(['begin', 'M0,0', 'L200,0', 'L100,200', 'close']);
  });

  it('自交多边形被拒绝并保留草稿，可撤销后重画', async () => {
    const { kernel, selections } = await mount();
    await run(kernel, 'regionSelect.tool.polygon');
    [[100, 100], [300, 300], [300, 100], [100, 300]].forEach(([x, y]) => click(x!, y!));
    await run(kernel, 'regionSelect.confirm');
    expect(selections).toHaveLength(0);
    expect(kernel.getState().regionSelect.draft).not.toBeNull();
    await run(kernel, 'regionSelect.undo');
    await run(kernel, 'regionSelect.confirm');
    await vi.waitFor(() => expect(selections).toHaveLength(1));
  });

  it('Esc（regionSelect.cancel）：先丢弃草稿，再退出工具，并广播 region:cancel', async () => {
    const { kernel } = await mount();
    const cancels: unknown[] = [];
    kernel.bus.on('region:cancel', (e) => void cancels.push(e));
    await run(kernel, 'regionSelect.tool.polygon');
    click(100, 100);
    expect(kernel.commands.isEnabled('regionSelect.cancel')).toBe(true);
    await run(kernel, 'regionSelect.cancel');
    expect(kernel.getState().regionSelect.draft).toBeNull();
    expect(kernel.getState().regionSelect.tool).toBe('polygon');
    await run(kernel, 'regionSelect.cancel');
    expect(kernel.getState().regionSelect.tool).toBeNull();
    expect(cancels).toEqual([{ origin: 'user', reason: 'cancel' }]);
    expect(kernel.commands.isEnabled('regionSelect.cancel')).toBe(false);
  });

  it('region:before-select 可否决；裁剪失败发 region:error 且不发 region:select', async () => {
    const { kernel, selections, cropper } = await mount();
    const events: string[] = [];
    kernel.bus.on('region:cancel', (e) => void events.push(`cancel:${e.reason}`));
    kernel.bus.on('region:error', () => void events.push('error'));
    const notices: unknown[] = [];
    kernel.services.provide(NOTIFY_SERVICE, { notify: (m, o) => (notices.push([m, o]), ''), dismiss() {}, confirm: async () => true });
    const off = kernel.bus.on('region:before-select', () => {
      throw new Error('面积超限');
    });
    await run(kernel, 'regionSelect.tool.rect');
    dragRect([100, 100], [300, 250]);
    await vi.waitFor(() => expect(events).toEqual(['cancel:rejected']));
    expect(selections).toHaveLength(0);
    off();

    cropper.crop = async () => {
      throw new Error('tainted');
    };
    dragRect([100, 100], [300, 250]);
    await vi.waitFor(() => expect(events).toContain('error'));
    expect(selections).toHaveLength(0);
    expect(kernel.getState().regionSelect.busy).toBe(false);
    // 失败要有用户可见的提示，而不是静默
    expect(notices).toEqual([['框选失败：tainted', { type: 'error' }]]);
  });

  it('pick()：以请求方为 origin 返回结果并退出；取消返回 null', async () => {
    const { kernel, selections } = await mount({ autoExit: false });
    const region = kernel.services.get(REGION_SERVICE);
    let picked!: ReturnType<typeof region.pick>;
    await act(async () => void (picked = region.pick({ origin: 'acme:ocr' })));
    dragRect([100, 100], [300, 250]);
    const result = await picked;
    expect(result?.origin).toBe('acme:ocr');
    expect(selections[0]).toBe(result);
    // pick 一次性，即使 autoExit 为 false 也退出
    expect(kernel.getState().regionSelect.tool).toBeNull();

    const cancelled = region.pick({ origin: 'acme:ocr', shape: 'polygon' });
    await run(kernel, 'regionSelect.cancel');
    expect(await cancelled).toBeNull();
  });

  it('新的 pick 取代旧请求（旧请求得到 null）；其他工具抢占舞台时退出', async () => {
    const { kernel } = await mount();
    const region = kernel.services.get(REGION_SERVICE);
    const first = region.pick({ origin: 'a' });
    const second = region.pick({ origin: 'b', shape: 'polygon' });
    expect(await first).toBeNull();
    expect(region.activeShape()).toBe('polygon');

    const cancels: unknown[] = [];
    kernel.bus.on('region:cancel', (e) => void cancels.push(e));
    act(() => void kernel.services.get(WORKSPACE_SERVICE).acquireTool('other'));
    expect(await second).toBeNull();
    expect(region.activeShape()).toBeNull();
    expect(cancels).toEqual([{ origin: 'b', reason: 'preempted' }]);
  });

  it('crop()：无 UI 裁剪；形状 crop 为 false（点位）时只返回 null', async () => {
    const { kernel, requests } = await mount({}, definePlugin({
      name: 'acme:point',
      dependencies: ['kabel:region-select'],
      setup: (ctx) =>
        contributeShape(ctx, {
          type: 'polygon',
          title: '点位',
          icon: 'box',
          createTool: () => ({ down() {}, move() {}, up() {}, canFinish: () => false, finish: () => false, reset: () => false }),
          bbox: () => ({ x: 5, y: 5, width: 0, height: 0 }),
          translate: (s) => s,
          crop: false,
          render: () => null,
        }),
    }));
    const region = kernel.services.get(REGION_SERVICE);
    const image = { id: 'a', name: 'a.jpg', kind: 'image', src: '/a.jpg', thumbnail: '/a.jpg' } as const;
    // 同类型贡献即替换：现在 polygon 没有面积
    expect(await region.crop(image, { type: 'polygon', points: [{ x: 5, y: 5 }] })).toBeNull();
    expect(requests).toHaveLength(0);
    // 矩形仍然正常
    const crop = await region.crop(image, { type: 'rect', x: 1.2, y: 2, width: 10, height: 10 }, { mime: 'image/jpeg' });
    expect(crop).toMatchObject({ mime: 'image/jpeg', bbox: { x: 1, y: 2, width: 11, height: 10 } });
  });

  it('自带右侧“框选结果”面板：只列用户框选；停用后面板消失；panel: false 不注册', async () => {
    const { kernel } = await mount();
    const panels = () => kernel.extensions.get(ExtensionPoints.panels).getAll().filter((p) => p.id === 'regionSelect.results');
    expect(panels()).toMatchObject([{ region: 'right', title: '框选结果' }]);

    await run(kernel, 'regionSelect.tool.rect');
    dragRect([100, 100], [300, 250]);
    await vi.waitFor(() => expect(host.querySelectorAll('.kb-rsel-results__item')).toHaveLength(1));
    expect(host.querySelector('.kb-rsel-results__item figcaption')!.textContent).toContain('200×150');

    // pick() 的结果由请求方处理，不进面板
    let picked!: Promise<unknown>;
    await act(async () => void (picked = kernel.services.get(REGION_SERVICE).pick({ origin: 'acme:ocr' })));
    dragRect([100, 100], [300, 250]);
    await picked;
    expect(host.querySelectorAll('.kb-rsel-results__item')).toHaveLength(1);

    await kernel.plugins.disable('kabel:region-select');
    expect(panels()).toEqual([]);

    const off = await mount({ panel: false });
    expect(off.kernel.extensions.get(ExtensionPoints.panels).getAll().some((p) => p.id === 'regionSelect.results')).toBe(false);
  });

  it('卸载后释放：命令、覆盖层、工具租约都被清理', async () => {
    const { kernel } = await mount();
    await run(kernel, 'regionSelect.tool.rect');
    await kernel.unuse('kabel:region-select');
    expect(kernel.commands.has('regionSelect.tool.rect')).toBe(false);
    expect(kernel.services.has(REGION_SERVICE)).toBe(false);
    expect(kernel.getState().stage.tool).toBeNull();
  });
});
