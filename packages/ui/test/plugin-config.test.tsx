import { createServiceToken, definePlugin, Schema } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { feedbackPlugin, layoutPlugin, settingsPlugin, Workbench } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const SVC = createServiceToken<string>('test.svc');

const Config = Schema.object({
  endpoint: Schema.string().default('http://a').description('服务地址'),
  rows: Schema.array(
    Schema.object({
      key: Schema.string().description('标识'),
      kind: Schema.union([Schema.const('text').description('文本'), Schema.const('date').description('日期')]).default('text').description('类型'),
    }),
  )
    .role('table')
    .default([])
    .description('字段'),
});

function mount() {
  const seen: unknown[] = [];
  const kernel = createTestKernel({
    plugins: [
      layoutPlugin(),
      feedbackPlugin(),
      settingsPlugin(),
      definePlugin({ name: 'cfg', title: '可配置', Config, setup: (_ctx, config) => void seen.push(config) }),
      definePlugin({ name: 'waiter', title: '等待者', inject: [SVC] }),
    ],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  act(() => void kernel.execute('settings.open', 'plugins'));
  return { kernel, seen };
}

const $ = (selector: string) => host.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];
const input = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};

describe('插件管理：状态与配置', () => {
  it('显示运行中 / 等待服务', () => {
    mount();
    const status = Object.fromEntries([...host.querySelectorAll<HTMLTableRowElement>('.kb-plugins tbody tr')].map((tr) => [tr.cells[1]!.textContent, tr.cells[2]!.textContent]));
    expect(status).toEqual({ cfg: '运行中', waiter: '等待服务' });
    expect($('.kb-plugins__status.is-pending')!.title).toBe('等待：test.svc');
  });

  it('由 Config 生成表单：编辑、新增表格行、保存后插件重载', () => {
    const { kernel, seen } = mount();
    act(() => $$('.kb-plugins button').find((b) => b.textContent === '配置')!.click());
    expect($('.kb-plugin-config__title')!.textContent).toBe('可配置');
    act(() => input($('#kb-schema-endpoint') as HTMLInputElement, 'http://10.20.0.14:8118/v1/models'));
    act(() => $$('.kb-schema__table-wrap button').find((b) => b.textContent === '添加')!.click());
    act(() => input(host.querySelector('.kb-schema__table tbody input') as HTMLInputElement, 'name'));
    act(() => input(host.querySelector('.kb-schema__table tbody select') as HTMLSelectElement, 'date'));
    act(() => $$('.kb-plugin-config__footer button').find((b) => b.textContent === '保存')!.click());
    return Promise.resolve().then(() => {
      expect(seen.at(-1)).toEqual({ endpoint: 'http://10.20.0.14:8118/v1/models', rows: [{ key: 'name', kind: 'date' }] });
      expect(kernel.plugins.hasStoredConfig('cfg')).toBe(true);
    });
  });
});
