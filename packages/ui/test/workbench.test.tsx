import { definePlugin, ExtensionPoints, historyPlugin, type DomView, type PanelViewProps, type PluginInput } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutPlugin, Workbench } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

function mount(plugins: PluginInput) {
  const kernel = createTestKernel({ plugins: [layoutPlugin(), historyPlugin(), plugins] });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return kernel;
}

const key = (target: EventTarget, init: KeyboardEventInit) =>
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })));

const shortcut = (run: () => void) =>
  definePlugin({ name: 'k', setup: (ctx) => ctx.registerCommand({ id: 'k.run', keybinding: 'Ctrl+Alt+K', run }) });

describe('Workbench', () => {
  it('DomView 面板：挂载一次、切换标签保持挂载、卸载贡献时释放', () => {
    const mountSpy = vi.fn();
    const unmountSpy = vi.fn();
    const view: DomView<PanelViewProps> = {
      mount(el, props) {
        mountSpy(props.panelId);
        el.textContent = 'dom-view';
        return { unmount: unmountSpy };
      },
    };
    const kernel = mount(
      definePlugin({
        name: 'p',
        setup(ctx) {
          ctx.contribute(
            ExtensionPoints.panels,
            { id: 'a', region: 'left', title: 'A', view },
            { id: 'b', region: 'left', title: 'B', view: () => <div class="preact-b">B</div> },
          );
        },
      }),
    );
    expect(host.querySelectorAll('.kb-tabs__tab')).toHaveLength(2);
    act(() => host.querySelectorAll<HTMLButtonElement>('.kb-tabs__tab')[1]!.click());
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('dom-view');
    act(() => kernel.unuse('p'));
    expect(unmountSpy).toHaveBeenCalled();
  });

  it('快捷键只在工作台内生效，不拦截宿主按键', () => {
    const run = vi.fn();
    mount(shortcut(run));
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    key(outside, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).not.toHaveBeenCalled();
    key(host.querySelector('.kb-toolbar')!, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('焦点在 body 时，仅当最近交互发生在工作台内才响应', () => {
    const run = vi.fn();
    mount(shortcut(run));
    key(document.body, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).not.toHaveBeenCalled();
    act(() => void host.querySelector('.kb-toolbar')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    key(document.body, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('工具栏按钮的禁用状态随命令状态变化', () => {
    const kernel = mount(null);
    const undo = () => host.querySelector<HTMLButtonElement>('button[title^="撤销"]')!;
    expect(undo().disabled).toBe(true);
    act(() => void kernel.commands.register({ id: 'kabel.undo', run: () => {} }));
    expect(undo().disabled).toBe(false);
  });
});
