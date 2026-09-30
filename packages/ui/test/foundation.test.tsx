import {
  createSlice,
  definePlugin,
  eventToKeybinding,
  ExtensionPoints,
  historyPlugin,
  isMacPlatform,
  modePlugin,
  NOTIFY_SERVICE,
  savePlugin,
  type DomView,
  type PluginInput,
} from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  contextMenuPlugin,
  feedbackPlugin,
  findConflicts,
  keymapActions,
  keymapPlugin,
  layoutPlugin,
  palettePlugin,
  settingsPlugin,
  Workbench,
} from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

function mount(extra: PluginInput = null) {
  const kernel = createTestKernel({
    plugins: [
      layoutPlugin({ persist: false }),
      historyPlugin(),
      modePlugin(),
      savePlugin({ confirmLeave: false }),
      feedbackPlugin(),
      keymapPlugin(),
      contextMenuPlugin(),
      palettePlugin(),
      settingsPlugin(),
      extra,
    ],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return kernel;
}

const mac = isMacPlatform();
const modKeys = { ctrlKey: !mac, metaKey: mac };
const key = (target: EventTarget, init: KeyboardEventInit) =>
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })));
const click = (el: Element | null) => act(() => void (el as HTMLElement).click());
const tick = () => act(() => new Promise<void>((r) => setTimeout(r)));

describe('消息与对话框', () => {
  it('notify 显示并自动关闭，可手动关闭', () => {
    vi.useFakeTimers();
    const kernel = mount();
    onTestFinished(() => void vi.useRealTimers());
    const notify = kernel.services.get(NOTIFY_SERVICE);
    act(() => void notify.notify('已保存', { type: 'success', duration: 1000 }));
    expect(host.querySelector('.kb-toast--success')!.textContent).toContain('已保存');
    act(() => void vi.advanceTimersByTime(1000));
    expect(host.querySelector('.kb-toast')).toBeNull();
    let id = '';
    act(() => void (id = notify.notify('一直显示', { duration: 0 })));
    expect(host.querySelector('.kb-toast')).not.toBeNull();
    act(() => void notify.dismiss(id));
    expect(host.querySelector('.kb-toast')).toBeNull();
  });

  it('confirm：确认返回 true，取消 / Esc 返回 false', async () => {
    const kernel = mount();
    const notify = kernel.services.get(NOTIFY_SERVICE);
    let result!: Promise<boolean>;
    act(() => void (result = notify.confirm({ title: '删除', message: '确定删除吗？', danger: true })));
    expect(host.querySelector('.kb-confirm')!.textContent).toContain('确定删除吗？');
    click(host.querySelector('.kb-confirm .kb-btn--danger'));
    await expect(result).resolves.toBe(true);
    expect(host.querySelector('.kb-confirm')).toBeNull();

    act(() => void (result = notify.confirm('继续？')));
    key(host.querySelector('.kb-confirm')!, { key: 'Escape' });
    await expect(result).resolves.toBe(false);
  });
});

describe('命令面板', () => {
  const plugin = (run: () => void) =>
    definePlugin({
      name: 'p',
      setup: (ctx) => {
        ctx.registerCommand({ id: 'p.hello', title: '打个招呼', run });
        ctx.registerCommand({ id: 'p.off', title: '不可用命令', enabled: () => false, run });
        ctx.registerCommand({ id: 'p.hidden', title: '隐藏命令', hidden: true, run });
      },
    });

  it('Shift + Mod + P 打开，过滤后 Enter 执行；不含禁用与隐藏命令', async () => {
    const run = vi.fn();
    mount(plugin(run));
    key(host.querySelector('.kb-toolbar')!, { key: 'P', shiftKey: true, ...modKeys });
    expect(host.querySelector('.kb-palette')).not.toBeNull();
    const titles = () => [...host.querySelectorAll('.kb-palette__title')].map((e) => e.textContent);
    expect(titles()).toContain('打个招呼');
    expect(titles()).not.toContain('不可用命令');
    expect(titles()).not.toContain('隐藏命令');
    const input = host.querySelector<HTMLInputElement>('.kb-palette__input')!;
    act(() => {
      input.value = '招呼';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(titles()).toEqual(['打个招呼']);
    key(input, { key: 'Enter' });
    await tick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.kb-palette')).toBeNull();
  });

  it('Esc 关闭；显示命令的快捷键', () => {
    const kernel = mount();
    act(() => void kernel.execute('palette.open'));
    expect(host.querySelector('.kb-palette .kb-keycap')).not.toBeNull();
    key(host.querySelector('.kb-palette__input')!, { key: 'Escape' });
    expect(host.querySelector('.kb-palette')).toBeNull();
  });
});

describe('快捷键改绑', () => {
  it('改绑后新快捷键生效、默认快捷键失效，并持久化', async () => {
    const run = vi.fn();
    const kernel = mount(
      definePlugin({ name: 'k', setup: (ctx) => ctx.registerCommand({ id: 'k.run', title: '运行', keybinding: 'Ctrl+Alt+K', run }) }),
    );
    key(host.querySelector('.kb-toolbar')!, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    act(() => void kernel.dispatch(keymapActions.set({ id: 'k.run', bindings: ['Ctrl+Alt+J'] })));
    key(host.querySelector('.kb-toolbar')!, { key: 'k', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    key(host.querySelector('.kb-toolbar')!, { key: 'j', ctrlKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(2);
    expect(kernel.storage.get('kabel:keymap:overrides.v1', null)).toEqual({ 'k.run': ['Ctrl+Alt+J'] });
  });

  it('冲突检测：找出已占用该快捷键的其他命令', () => {
    const kernel = mount();
    const conflicts = findConflicts(kernel, mac ? 'Mod+Z' : 'Mod+Z', 'k.other');
    expect(conflicts.map((c) => c.command.id)).toEqual(['kabel.undo']);
    expect(findConflicts(kernel, 'Mod+Z', 'kabel.undo')).toEqual([]);
  });

  it('设置 › 快捷键：录入冲突时提示，覆盖后原命令失去该快捷键', () => {
    const kernel = mount();
    act(() => void kernel.execute('settings.open', 'shortcuts'));
    const rows = () => [...host.querySelectorAll('.kb-shortcuts__table tbody tr')];
    const row = rows().find((r) => r.textContent?.includes('kabel.redo'))!;
    click([...row.querySelectorAll('button')].find((b) => b.textContent === '修改')!);
    const recorder = host.querySelector<HTMLElement>('.kb-keycap--recording')!;
    const combo = eventToKeybinding({ key: 'z', ctrlKey: !mac, metaKey: mac, shiftKey: false, altKey: false })!;
    key(recorder, { key: 'z', ctrlKey: !mac, metaKey: mac });
    expect(combo).toBe('Mod+Z');
    expect(host.querySelector('.kb-shortcuts__conflict')!.textContent).toContain('已被「撤销」使用');
    click([...host.querySelectorAll('.kb-shortcuts__conflict button')].find((b) => b.textContent === '覆盖')!);
    const state = kernel.getState().keymap.overrides;
    expect(state['kabel.redo']).toEqual(['Mod+Z']);
    expect(state['kabel.undo']).toEqual([]);
  });
});

describe('右键菜单', () => {
  const contextmenu = (el: Element, x = 40, y = 30) =>
    act(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })));

  const zone = definePlugin({
    name: 'zone',
    setup(ctx) {
      ctx.contribute(ExtensionPoints.panels, {
        id: 'zone.panel',
        region: 'left',
        title: '区域',
        view: () => (
          <div>
            <button class="zone-item" data-kb-context="zone" data-kb-context-data="7">
              项
            </button>
          </div>
        ),
      });
      ctx.contribute(
        ExtensionPoints.contextMenu,
        { id: 'zone.a', target: 'zone', group: 'g1', label: '动作 A', onClick: (k, c) => k.bus.emit('zone:picked', c.data) },
        { id: 'zone.b', target: ['zone', 'other'], group: 'g2', label: '动作 B', onClick: () => {} },
        { id: 'zone.none', target: 'nowhere', label: '不应出现', onClick: () => {} },
      );
    },
  });

  it('在带 data-kb-context 的元素上右键，显示匹配 target 的菜单项（按组分隔），点击执行并传入 data', () => {
    const kernel = mount(zone);
    const picked = vi.fn();
    kernel.bus.on('zone:picked', picked);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => void host.querySelector('.zone-item')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect([...host.querySelectorAll('.kb-contextmenu__label')].map((e) => e.textContent)).toEqual(['动作 A', '动作 B']);
    expect(host.querySelectorAll('.kb-contextmenu__sep')).toHaveLength(1);
    click(host.querySelector('.kb-contextmenu__item'));
    expect(picked).toHaveBeenCalledWith('7');
    expect(host.querySelector('.kb-contextmenu')).toBeNull();
  });

  it('没有匹配菜单项时保留浏览器原生菜单；when 可隐藏菜单项', () => {
    const kernel = mount(
      definePlugin({
        name: 'c',
        setup: (ctx) =>
          ctx.contribute(ExtensionPoints.contextMenu, {
            id: 'c.only-read',
            target: 'workbench',
            label: '仅只读可见',
            onClick: () => {},
            when: (s) => !!s.mode?.readonly,
          }),
      }),
    );
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => void host.querySelector('.kb-toolbar')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    act(() => void kernel.execute('kabel.setReadonly', true));
    contextmenu(host.querySelector('.kb-toolbar')!);
    expect(host.querySelector('.kb-contextmenu__label')!.textContent).toBe('仅只读可见');
    key(host.querySelector('.kb-contextmenu')!, { key: 'Escape' });
    expect(host.querySelector('.kb-contextmenu')).toBeNull();
  });
});

describe('视图错误边界', () => {
  it('面板渲染出错只影响该面板，并派发 error 事件，可重试', () => {
    let fail = true;
    const errors: unknown[] = [];
    const Bad = () => {
      if (fail) throw new Error('boom');
      return <div class="good">ok</div>;
    };
    const dom: DomView<{}> = {
      mount() {
        throw new Error('dom boom');
      },
    };
    const kernel = mount(
      definePlugin({
        name: 'e',
        setup: (ctx) => {
          ctx.contribute(ExtensionPoints.panels, { id: 'e.bad', region: 'right', title: '坏面板', view: Bad });
          ctx.contribute(ExtensionPoints.panels, { id: 'e.dom', region: 'right', title: 'DOM 面板', view: dom as never });
        },
      }),
    );
    kernel.bus.on('error', (e) => errors.push(e.error));
    expect(host.querySelectorAll('.kb-view-error')).toHaveLength(2);
    expect(host.querySelector('.kb-toolbar')).not.toBeNull(); // 其他区域不受影响
    // 仍然失败时重试：再次隔离并派发 error 事件
    const retry = () => click([...host.querySelectorAll<HTMLButtonElement>('.kb-view-error button')][0]!);
    retry();
    expect(errors.map((e) => (e as Error).message)).toContain('boom');
    fail = false;
    retry();
    expect(host.querySelector('.good')).not.toBeNull();
    expect(host.querySelectorAll('.kb-view-error')).toHaveLength(1);
  });
});

describe('保存与脏状态', () => {
  it('有未保存修改时显示“未保存”，保存成功后清除', async () => {
    const slice = createSlice({ name: 'doc', initialState: { v: 0 }, reducers: { inc: (s: { v: number }) => ({ v: s.v + 1 }) }, history: true });
    const kernel = mount(definePlugin({ name: 's', setup: (ctx) => ctx.registerSlice(slice) }));
    act(() => void kernel.dispatch(slice.actions.inc()));
    expect(host.querySelector('.kb-statusbar')!.textContent).toContain('未保存');
    kernel.bus.on('save', () => {});
    await act(() => kernel.execute('kabel.save'));
    expect(host.querySelector('.kb-statusbar')!.textContent).not.toContain('未保存');
    expect(kernel.history.isDirty()).toBe(false);
  });

  it('只读时状态栏显示“只读”，撤销与保存按钮禁用', () => {
    const kernel = mount();
    act(() => void kernel.execute('kabel.setReadonly', true));
    expect(host.querySelector('.kb-statusbar')!.textContent).toContain('只读');
    expect(kernel.commands.isEnabled('kabel.save')).toBe(false);
  });
});
