import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  createSlice,
  definePlugin,
  eventToKeybinding,
  historyPlugin,
  matchKeybinding,
  modePlugin,
  NOTIFY_SERVICE,
  sameKeybinding,
  savePlugin,
  type NotifyService,
} from '../src';
import { createTestKernel, setupPlugins } from '../src/testing';

describe('快捷键工具', () => {
  it('eventToKeybinding：修饰键顺序固定，只按修饰键返回 null', () => {
    const base = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    expect(eventToKeybinding({ ...base, key: 'Shift', shiftKey: true }, false)).toBeNull();
    expect(eventToKeybinding({ ...base, key: 'p', ctrlKey: true, shiftKey: true }, false)).toBe('Mod+Shift+P');
    expect(eventToKeybinding({ ...base, key: 'p', metaKey: true, shiftKey: true }, true)).toBe('Mod+Shift+P');
    expect(eventToKeybinding({ ...base, key: 'k', ctrlKey: true }, true)).toBe('Ctrl+K');
    expect(eventToKeybinding({ ...base, key: ' ' }, false)).toBe('Space');
    expect(eventToKeybinding({ ...base, key: 'ArrowLeft', altKey: true }, false)).toBe('Alt+Arrowleft');
  });

  it('sameKeybinding 忽略大小写与修饰键顺序；Space 可匹配', () => {
    expect(sameKeybinding('Shift+Mod+P', 'mod+shift+p', false)).toBe(true);
    expect(sameKeybinding('Mod+P', 'Mod+Shift+P', false)).toBe(false);
    const ev = { key: ' ', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    expect(matchKeybinding(ev, 'Space', false)).toBe(true);
  });
});

describe('只读模式', () => {
  it('mutates 命令在只读时禁用，切换后恢复，并派发 mode:change', async () => {
    const { kernel } = await setupPlugins([
      historyPlugin(),
      modePlugin(),
      definePlugin({
        name: 't',
        setup: (ctx) => {
          ctx.registerCommand({ id: 't.write', mutates: true, run: () => 1 });
          ctx.registerCommand({ id: 't.read', run: () => 2 });
        },
      }),
    ]);
    const onMode = vi.fn();
    kernel.bus.on('mode:change', onMode);
    expect(kernel.commands.isEnabled('t.write')).toBe(true);
    await kernel.execute('kabel.setReadonly', true);
    expect(kernel.commands.isEnabled('t.write')).toBe(false);
    expect(kernel.commands.isEnabled('t.read')).toBe(true);
    expect(kernel.commands.isEnabled('kabel.undo')).toBe(false);
    expect(onMode).toHaveBeenCalledWith({ readonly: true });
    await kernel.execute('kabel.setReadonly', false);
    expect(kernel.commands.isEnabled('t.write')).toBe(true);
  });

  it('初始只读', async () => {
    const { kernel } = await setupPlugins(modePlugin({ readonly: true }));
    expect(kernel.getState().mode?.readonly).toBe(true);
  });
});

describe('保存契约', () => {
  const setup = async (onSave?: () => unknown) => {
    const kernel = createTestKernel();
    const notify: NotifyService = { notify: vi.fn(() => 'id'), dismiss: vi.fn(), confirm: vi.fn(async () => true) };
    await kernel.use([
      historyPlugin(),
      savePlugin({ confirmLeave: false }),
      definePlugin({ name: 'n', setup: (ctx) => void ctx.provide(NOTIFY_SERVICE, notify) }),
    ]);
    if (onSave) kernel.bus.on('save', onSave);
    return { kernel, notify };
  };

  it('等待所有处理器完成后标记已保存并派发 saved', async () => {
    let finish!: () => void;
    const { kernel } = await setup(() => new Promise<void>((r) => (finish = r)));
    const saved = vi.fn();
    kernel.bus.on('saved', saved);
    const running = kernel.execute('kabel.save');
    expect(kernel.getState().save?.saving).toBe(true);
    expect(kernel.commands.isEnabled('kabel.save')).toBe(false);
    finish();
    await expect(running).resolves.toEqual({ ok: true });
    expect(saved).toHaveBeenCalledWith({ reason: 'manual' });
    expect(kernel.getState().save).toMatchObject({ saving: false, error: null });
    expect(kernel.getState().save?.savedAt).toBeTypeOf('number');
  });

  it('保存成功后清除 dirty', async () => {
    const slice = createSlice({ name: 'doc', initialState: { v: 0 }, reducers: { inc: (s: { v: number }) => ({ v: s.v + 1 }) }, history: true });
    const { kernel } = await setup(() => {});
    await kernel.use(definePlugin({ name: 'd', setup: (ctx) => ctx.registerSlice(slice) }));
    kernel.dispatch(slice.actions.inc());
    expect(kernel.getState().history.dirty).toBe(true);
    await kernel.execute('kabel.save');
    expect(kernel.getState().history.dirty).toBe(false);
  });

  it('处理器失败：不标记已保存，派发 save:error 并提示', async () => {
    const { kernel, notify } = await setup(() => Promise.reject(new Error('网络错误')));
    const onError = vi.fn();
    kernel.bus.on('save:error', onError);
    const result = await kernel.execute('kabel.save');
    expect(result).toMatchObject({ ok: false });
    expect(onError).toHaveBeenCalled();
    expect(kernel.getState().save).toMatchObject({ saving: false, error: '网络错误' });
    expect(notify.notify).toHaveBeenCalledWith('保存失败：网络错误', { type: 'error' });
  });

  it('保存按钮仅在有 save 监听或有未保存修改时出现；只读时不可保存', async () => {
    const kernel = createKernel({ instanceId: 't', storage: 'memory' });
    await kernel.use([historyPlugin(), modePlugin(), savePlugin({ confirmLeave: false })]);
    const item = kernel.extensions.get((await import('../src')).ExtensionPoints.toolbar).getAll().find((i) => i.id === 'save.save')!;
    expect(item.when!(kernel.getState(), kernel)).toBe(false);
    kernel.bus.on('save', () => {});
    expect(item.when!(kernel.getState(), kernel)).toBe(true);
    await kernel.execute('kabel.setReadonly', true);
    expect(kernel.commands.isEnabled('kabel.save')).toBe(false);
  });
});
