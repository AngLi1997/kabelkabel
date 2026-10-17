import { historyPlugin } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { field, FIELDS_SERVICE, fieldsPlugin } from '@kabel/plugin-fields';
import { layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogPlugin } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

function mount() {
  const kernel = createTestKernel({
    plugins: [
      layoutPlugin(),
      historyPlugin(),
      fieldsPlugin({
        groups: [
          {
            key: 'g',
            title: '主体信息',
            collapsed: false,
            fields: [field('name', '名称', { required: true }), field('code', '证件号码'), field('addr', '住所', { more: true })] as never,
          },
        ],
      }),
      catalogPlugin({ region: 'main' }),
    ],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return kernel;
}

const $ = (selector: string) => host.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

describe('catalogPlugin', () => {
  it('按分组渲染字段，“更多字段”默认折叠', () => {
    mount();
    expect($$('.kb-catalog__field').map((f) => f.dataset.field)).toEqual(['name', 'code']);
    act(() => $$('.kb-catalog__more')[0]!.click());
    expect($$('.kb-catalog__field').map((f) => f.dataset.field)).toEqual(['name', 'code', 'addr']);
  });

  it('输入写入字段模型；Enter 跳到下一个字段', () => {
    const kernel = mount();
    const fields = kernel.services.get(FIELDS_SERVICE);
    const name = $('[data-field="name"] input') as HTMLInputElement;
    act(() => {
      name.focus();
      name.value = '星辰';
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(fields.get('name')).toMatchObject({ value: '星辰', source: 'user' });
    expect(fields.focused()).toBe('name');
    act(() => void name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(fields.focused()).toBe('code');
  });

  it('机器填写的值显示来源与待复核，可确认；聚焦到“更多”字段时自动展开', () => {
    const kernel = mount();
    const fields = kernel.services.get(FIELDS_SERVICE);
    act(() => void fields.set('code', '91510108', { source: 'ai', review: 'pending' }));
    expect($('[data-field="code"] .kb-catalog__source')!.textContent).toBe('AI 已填入 · 待复核');
    act(() => $$('[data-field="code"] .kb-catalog__link').find((b) => b.textContent === '确认')!.click());
    expect(fields.get('code')!.review).toBe('confirmed');
    act(() => void fields.focus('addr'));
    expect($('[data-field="addr"]')).not.toBeNull();
  });
});
