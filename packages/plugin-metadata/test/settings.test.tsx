import { historyPlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { settingsPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { METADATA_SERVICE, metadataPlugin, toSchemaInput, normalizeSchema } from '../src';

const schema = [
  { key: 'title', label: '题名', required: true },
  { key: 'year', label: '年度', type: 'number' },
];

let host: HTMLElement | undefined;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = undefined;
});

describe('著录面板操作', () => {
  it('著录面板在右侧，面板右上角按钮：AI 填充、元数据设置、展开收起', async () => {
    const { kernel, panels } = await setupPlugins(metadataPlugin({ schema }));
    expect(panels().find((p) => p.id === 'metadata.form')!.region).toBe('right');
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host!));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.kb-md__bar button')];
    expect(buttons.map((b) => b.title)).toEqual(['AI 填充（暂未开放）', '元数据设置', '展开/收起全部分组']);
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[1]!.disabled).toBe(true); // 未注册设置插件
  });

  it('未配置 aiFill 时不可用；配置后以一条历史写入', async () => {
    const plain = await setupPlugins(metadataPlugin({ schema }));
    expect(plain.kernel.commands.isEnabled('metadata.aiFill')).toBe(false);

    const aiFill = vi.fn(async () => ({ title: '识别出的题名', year: 2024 }));
    const { kernel } = await setupPlugins([historyPlugin(), metadataPlugin({ schema, aiFill })]);
    const running = kernel.execute('metadata.aiFill');
    expect(kernel.getState().metadata.filling).toBe(true);
    expect(kernel.commands.isEnabled('metadata.aiFill')).toBe(false);
    await running;
    expect(aiFill).toHaveBeenCalledWith(kernel);
    expect(kernel.getState().record.values).toMatchObject({ title: '识别出的题名', year: 2024 });
    expect(kernel.getState().history.past.at(-1)?.label).toBe('AI 填充');
    expect(kernel.getState().metadata.filling).toBe(false);
  });

  it('元数据设置：打开设置页，切换必填/显示并派发 schema:change，可恢复初始方案', async () => {
    const { kernel } = await setupPlugins([settingsPlugin(), metadataPlugin({ schema })]);
    const onChange = vi.fn();
    kernel.bus.on('schema:change', onChange);
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host!));
    await act(() => kernel.execute('metadata.openSettings'));
    expect(host.querySelector('.kb-settings__nav-item.is-active')!.textContent).toBe('著录项');

    const row = [...host.querySelectorAll('.kb-md-settings tbody tr')].find((tr) => tr.textContent!.includes('year'))!;
    const [required, visible] = row.querySelectorAll<HTMLButtonElement>('[role="switch"]');
    act(() => required!.click());
    act(() => visible!.click());
    const field = kernel.services.get(METADATA_SERVICE).getSchema().fields.year!;
    expect(field).toMatchObject({ required: true, hidden: true });
    expect(onChange).toHaveBeenCalledTimes(2);

    await act(() => kernel.execute('metadata.resetSchema'));
    expect(kernel.services.get(METADATA_SERVICE).getSchema().fields.year!.hidden).toBeFalsy();
  });

  it('toSchemaInput 可往返归一化', () => {
    const normalized = normalizeSchema([{ key: 'a', label: 'A', type: 'select', options: ['x'] }]);
    expect(normalizeSchema(toSchemaInput(normalized))).toEqual(normalized);
  });
});
