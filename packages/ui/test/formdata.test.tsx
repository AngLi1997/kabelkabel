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

  it('sanitize 校验分区比例', () => {
    const config = resolveLayoutConfig();
    const base = createInitialLayout(config);
    expect(sanitize(base, { splits: { left: 0.01, right: 'x', foo: 0.5 } } as never, config).splits).toEqual({ left: 0.15 });
    expect(createLayoutSlice(config).getInitialState().splits).toEqual({});
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
