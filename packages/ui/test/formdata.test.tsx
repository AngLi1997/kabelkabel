import { ExtensionPoints } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInitialLayout,
  createLayoutSlice,
  feedbackPlugin,
  formDataViewPlugin,
  layoutActions,
  layoutPlugin,
  resolveLayoutConfig,
  sanitize,
  Workbench,
} from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const mount = (kernel: ReturnType<typeof createTestKernel>) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
};
const flush = () => new Promise((r) => setTimeout(r));
const panel = (id: string, slot?: 'bottom') => ({ id, region: 'left' as const, slot, title: id, view: () => <div class={`v-${id}`} /> });

describe('左侧上下分区', () => {
  it('slot: bottom 的面板放在下半区，可调整比例；只有下半区面板时按主区显示', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false, regions: { left: { split: 0.4 } } })] });
    const point = kernel.extensions.get(ExtensionPoints.panels);
    const lower = point.add(panel('b1', 'bottom'));
    mount(kernel);
    let left = host.querySelector('[data-region="left"]')!;
    expect(left.classList.contains('is-split')).toBe(false);
    expect(left.querySelector('.kb-region__title')?.textContent).toBe('b1');

    act(() => void point.add(panel('t1')));
    act(() => void point.add(panel('b2', 'bottom')));
    left = host.querySelector('[data-region="left"]')!;
    expect(left.classList.contains('is-split')).toBe(true);
    const section = left.querySelector<HTMLElement>('.kb-region__lower')!;
    expect(section.style.flex).toContain('0.4');
    expect([...section.querySelectorAll('.kb-tabs__tab')].map((t) => t.textContent)).toEqual(['b1', 'b2']);

    await act(() => kernel.execute('layout.showPanel', 'b2'));
    expect(kernel.getState().layout.active['left.bottom']).toBe('b2');
    expect(section.querySelector<HTMLElement>('.v-b2')!.parentElement!.parentElement!.hidden).toBe(false);

    act(() => kernel.dispatch(layoutActions.setSplit({ region: 'left', ratio: 2 })));
    expect(kernel.getState().layout.splits.left).toBe(0.85);
    lower.dispose();
  });

  it('下半区可收起为标题栏', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false })] });
    const point = kernel.extensions.get(ExtensionPoints.panels);
    point.add(panel('t1'));
    point.add(panel('b1', 'bottom'));
    mount(kernel);
    const section = () => host.querySelector<HTMLElement>('.kb-region__lower')!;
    act(() => (section().querySelector('.kb-region__subheader button') as HTMLElement).click());
    expect(kernel.getState().layout.folded['left.bottom']).toBe(true);
    expect(section().classList.contains('is-folded')).toBe(true);
    expect(section().querySelector<HTMLElement>('.kb-region__body')!.hidden).toBe(true);
    expect(host.querySelector('.kb-region__split')).toBeNull();
  });

  it('sanitize 校验分区比例', () => {
    const config = resolveLayoutConfig();
    const base = createInitialLayout(config);
    expect(sanitize(base, { splits: { left: 0.01, right: 'x', foo: 0.5 } } as never, config).splits).toEqual({ left: 0.15 });
    expect(createLayoutSlice(config).getInitialState().splits).toEqual({});
  });
});

describe('面板摆放', () => {
  const regionOf = (id: string) => host.querySelector(`.v-${id}`)?.closest('[data-region]')?.getAttribute('data-region');
  const inLower = (id: string) => !!host.querySelector(`.kb-region__lower .v-${id}`);

  it('优先级：用户调整 > 宿主 layout.panels > 摆放贡献 > 面板默认', async () => {
    const kernel = createTestKernel({
      plugins: [layoutPlugin({ persist: false, panels: { b: { region: 'right', slot: 'bottom' } } })],
    });
    const point = kernel.extensions.get(ExtensionPoints.panels);
    point.add(panel('a'));
    point.add(panel('b'));
    point.add(panel('c'));
    mount(kernel);
    expect(regionOf('a')).toBe('left');
    expect(regionOf('b')).toBe('right');

    // 摆放贡献只改位置与标题，视图不变；宿主配置优先于摆放贡献
    const placement = kernel.extensions.get(ExtensionPoints.placements);
    let moved!: { dispose(): void };
    act(() => void (moved = placement.add({ id: 'a', region: 'right', title: '改名' })));
    act(() => void placement.add({ id: 'b', region: 'left' }));
    expect(regionOf('a')).toBe('right');
    expect(regionOf('b')).toBe('right');
    expect(host.querySelector('[data-region="right"] .kb-region__header')?.textContent).toContain('改名');

    // 用户调整优先，并可恢复
    await act(() => kernel.execute('layout.movePanel', 'b', { region: 'left', slot: 'bottom' }));
    expect(regionOf('b')).toBe('left');
    expect(inLower('b')).toBe(true);
    expect(kernel.getState().layout.active['left.bottom']).toBe('b');
    await act(() => kernel.execute('layout.resetPanel', 'b'));
    expect(regionOf('b')).toBe('right');

    // 摆放贡献撤回后恢复面板默认位置
    act(() => moved.dispose());
    expect(regionOf('a')).toBe('left');
  });

  it('面板标题栏右键菜单：移到其他区域、恢复默认位置', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false })] });
    const point = kernel.extensions.get(ExtensionPoints.panels);
    point.add(panel('a'));
    point.add({ ...panel('m'), region: 'main' });
    mount(kernel);
    const items = (id: string) =>
      kernel.extensions
        .get(ExtensionPoints.contextMenu)
        .getAll()
        .filter((i) => i.target === 'panel' && (!i.when || i.when(kernel.getState(), kernel, { target: 'panel', data: id })));
    expect(items('a').map((i) => i.label)).toEqual(['移到左侧下方', '移到右侧', '移到右侧下方']);
    expect(items('m')).toEqual([]);
    await act(async () => void (await items('a').find((i) => i.label === '移到右侧')!.onClick!(kernel, { target: 'panel', data: 'a' })));
    expect(regionOf('a')).toBe('right');
    expect(items('a').map((i) => i.label)).toContain('恢复默认位置');
    expect(host.querySelector('[data-region="right"] .kb-region__header')?.getAttribute('data-kb-context-data')).toBe('a');
    act(() => kernel.dispatch(layoutActions.reset()));
    expect(regionOf('a')).toBe('left');
  });

  it('sanitize 校验用户摆放', () => {
    const config = resolveLayoutConfig();
    const base = createInitialLayout(config);
    const saved = { placements: { a: { region: 'right', slot: 'x', order: 3, extra: 1 }, b: { region: 'top' }, c: 1 } };
    expect(sanitize(base, saved as never, config).placements).toEqual({ a: { region: 'right', order: 3 } });
  });
});

describe('查看表单数据', () => {
  it('有提供者时显示按钮，弹窗展示全部插件的提交数据', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false }), feedbackPlugin(), formDataViewPlugin()] });
    mount(kernel);
    const button = () => [...host.querySelectorAll('.kb-toolbar button')].find((b) => b.textContent === '查看表单数据');
    expect(button()).toBeUndefined();

    act(() => {
      kernel.extensions.get(ExtensionPoints.formData).add({ id: 'catalog', title: '著录', collect: () => ({ title: '公司章程' }) });
      kernel.extensions.get(ExtensionPoints.formData).add({ id: 'bad', title: '坏的', collect: async () => Promise.reject(new Error('失败')) });
    });
    await act(async () => (button() as HTMLElement).click());
    await act(async () => void (await flush()));
    const json = () => host.querySelector('.kb-formdata__json')?.textContent ?? '';
    expect(JSON.parse(json())).toEqual({ catalog: { title: '公司章程' }, bad: { error: '失败' } });
    const tabs = [...host.querySelectorAll<HTMLElement>('.kb-formdata__nav-item')];
    expect(tabs.map((t) => t.textContent)).toEqual(['全部', '著录', '坏的']);
    act(() => tabs[1]!.click());
    expect(JSON.parse(json())).toEqual({ title: '公司章程' });

    expect(host.querySelector('[data-dialog="formData.view"] .kb-dialog__title')?.textContent).toBe('表单数据');
    await act(() => kernel.execute('formData.close'));
    expect(host.querySelector('[data-dialog="formData.view"]')).toBeNull();
  });
});
