import { definePlugin, ExtensionPoints, historyPlugin } from '@kabel/core';
import { createTestKernel, setupPlugins } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutPlugin, sanitizeTheme, DEFAULT_THEME, settingsPlugin, themeActions, themePlugin, Workbench } from '../src';

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
      settingsPlugin(),
      themePlugin(),
      definePlugin({ name: 'base', title: '基础' }),
      definePlugin({ name: 'child', title: '子插件', dependencies: ['base', 'kabel:layout'] }),
      definePlugin({ name: 'extra', title: '扩展' }),
    ],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return kernel;
}

const $ = (selector: string) => host.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

describe('settingsPlugin', () => {
  it('工具栏右侧设置按钮打开弹窗，Esc 与关闭按钮关闭', () => {
    const kernel = mount();
    expect($('.kb-settings')).toBeNull();
    act(() => $('.kb-toolbar__group:last-child button[title="设置"]')!.click());
    expect($('.kb-settings [role="dialog"]')).not.toBeNull();
    expect($$('.kb-settings__nav-item').map((el) => el.textContent)).toEqual(['插件管理', '主题']);
    act(() => void $('.kb-settings__dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(kernel.getState().settings.open).toBe(false);
    act(() => void kernel.execute('settings.open', 'theme'));
    expect($('.kb-settings__nav-item.is-active')!.textContent).toBe('主题');
    act(() => $('.kb-settings__header button')!.click());
    expect($('.kb-settings')).toBeNull();
  });

  it('插件管理：树形列表、隐藏内置插件，停用时依赖方一并停用', () => {
    const kernel = mount();
    act(() => void kernel.execute('settings.open', 'plugins'));
    const rows = () => $$('.kb-table tbody tr').map((tr) => tr.firstElementChild!.textContent);
    expect(rows()).toEqual(['基础', '子插件', '扩展']);
    expect($('.kb-table__group')).toBeNull();
    expect($$('.kb-table__code').map((td) => td.textContent)).not.toContain('kabel:layout');
    const row = (name: string) => $$('.kb-table tbody tr').find((tr) => tr.querySelector('.kb-table__code')?.textContent === name)!;
    expect(row('child').querySelector('.kb-plugins__branch')).not.toBeNull();
    act(() => row('base').querySelector<HTMLElement>('[role="switch"]')!.click());
    expect(kernel.plugins.isDisabled('child')).toBe(true);
    expect(rows()).toEqual(['基础', '子插件', '扩展']);
    act(() => row('child').querySelector<HTMLElement>('[role="switch"]')!.click());
    expect(kernel.plugins.has('base') && kernel.plugins.has('child')).toBe(true);
    act(() => row('extra').querySelector<HTMLElement>('[role="switch"]')!.click());
    expect(kernel.plugins.isDisabled('extra')).toBe(true);
    expect(row('extra').classList.contains('is-disabled')).toBe(true);
    act(() => row('extra').querySelector<HTMLElement>('[role="switch"]')!.click());
    expect(kernel.plugins.has('extra')).toBe(true);
  });
});

describe('themePlugin', () => {
  it('主题写入根节点属性与变量，并持久化', async () => {
    const kernel = mount();
    const root = $('.kb-root')!;
    expect(root.hasAttribute('data-scheme')).toBe(false);
    act(() => kernel.dispatch(themeActions.set({ scheme: 'dark', accent: '#a4262c', density: 'compact', fontSize: 14 })));
    expect(root.dataset.scheme).toBe('dark');
    expect(root.dataset.density).toBe('compact');
    expect(root.style.getPropertyValue('--kb-accent')).toBe('#a4262c');
    expect(root.style.getPropertyValue('--kb-font-size')).toBe('14px');
    expect(kernel.storage.scope('kabel:theme').get('state.v1', null)).toMatchObject({ scheme: 'dark' });
    await kernel.execute('theme.reset');
    expect(kernel.getState().theme).toEqual(DEFAULT_THEME);
  });

  it('贡献主题设置页；sanitize 丢弃非法值', async () => {
    const { kernel } = await setupPlugins([settingsPlugin(), themePlugin({ defaults: { density: 'comfortable' } })]);
    expect(kernel.extensions.get(ExtensionPoints.settings).getAll().map((p) => p.id)).toEqual(['plugins', 'theme']);
    expect(kernel.getState().theme.density).toBe('comfortable');
    expect(sanitizeTheme(DEFAULT_THEME, { scheme: 'x', accent: 'red;', fontSize: 99 } as never)).toEqual(DEFAULT_THEME);
  });
});
