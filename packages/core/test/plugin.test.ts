import { describe, expect, it, vi } from 'vitest';
import {
  createServiceToken,
  createSlice,
  definePlugin,
  ExtensionPoints,
  historyPlugin,
  sortByDependencies,
  type KabelPlugin,
} from '../src';
import { createTestKernel, setupPlugins } from '../src/testing';

const named = (name: string, dependencies?: string[]): KabelPlugin => ({ name, dependencies });

describe('sortByDependencies', () => {
  it('按依赖排序', () => {
    const order = sortByDependencies([named('c', ['b']), named('b', ['a']), named('a')]).map((p) => p.name);
    expect(order).toEqual(['a', 'b', 'c']);
  });
  it('缺失依赖报错', () => {
    expect(() => sortByDependencies([named('a', ['x'])])).toThrow(/requires "x"/);
  });
  it('循环依赖报错', () => {
    expect(() => sortByDependencies([named('a', ['b']), named('b', ['a'])])).toThrow(/circular/);
  });
  it('已注册的依赖视为满足', () => {
    expect(sortByDependencies([named('b', ['a'])], new Set(['a']))).toHaveLength(1);
  });
});

describe('PluginManager', () => {
  it('同步插件在 createKernel 返回前即完成注册', () => {
    const setup = vi.fn();
    const kernel = createTestKernel({ plugins: [definePlugin({ name: 'a', setup })] });
    expect(setup).toHaveBeenCalledTimes(1);
    expect(kernel.plugins.has('a')).toBe(true);
  });

  it('卸载时自动释放通过 ctx 注册的资源', async () => {
    const slice = createSlice({ name: 'demo', initialState: 1, reducers: {} });
    const token = createServiceToken<string>('demo');
    const onEvent = vi.fn();
    const teardown = vi.fn();
    const plugin = definePlugin({
      name: 'demo',
      setup(ctx) {
        ctx.registerSlice(slice);
        ctx.registerCommand({ id: 'demo.run', run: () => 1 });
        ctx.contribute(ExtensionPoints.toolbar, { id: 'demo.btn', command: 'demo.run' });
        ctx.provide(token, 'svc');
        ctx.on('demo:event', onEvent);
        return teardown;
      },
    });
    const { kernel, toolbar } = await setupPlugins(plugin);
    expect(kernel.getState().demo).toBe(1);
    expect(toolbar()).toHaveLength(1);
    expect(kernel.services.get(token)).toBe('svc');
    kernel.unuse('demo');
    kernel.bus.emit('demo:event');
    expect(onEvent).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalled();
    expect('demo' in kernel.getState()).toBe(false);
    expect(kernel.commands.has('demo.run')).toBe(false);
    expect(toolbar()).toHaveLength(0);
    expect(kernel.services.has(token)).toBe(false);
  });

  it('卸载依赖时先卸载依赖方', async () => {
    const { kernel } = await setupPlugins([named('base'), named('ext', ['base'])]);
    kernel.unuse('base');
    expect(kernel.plugins.list()).toHaveLength(0);
  });

  it('支持懒加载与异步 setup', async () => {
    const kernel = createTestKernel();
    const lazy = () => Promise.resolve({ default: definePlugin({ name: 'lazy', setup: async () => {} }) });
    await kernel.use(lazy);
    expect(kernel.plugins.has('lazy')).toBe(true);
  });

  it('setup 失败不影响其他插件并触发 error 事件', async () => {
    const kernel = createTestKernel();
    const onError = vi.fn();
    kernel.bus.on('error', onError);
    await kernel.use([
      definePlugin({
        name: 'bad',
        setup() {
          throw new Error('x');
        },
      }),
      named('good'),
    ]);
    expect(kernel.plugins.has('bad')).toBe(false);
    expect(kernel.plugins.has('good')).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ source: 'plugin:bad' }));
  });

  it('重复注册报错', async () => {
    const kernel = createTestKernel({ plugins: named('a') });
    await expect(kernel.use(named('a'))).rejects.toThrow(/already registered/);
  });
});

describe('CommandRegistry', () => {
  it('后注册覆盖先注册，释放后恢复', async () => {
    const kernel = createTestKernel();
    kernel.commands.register({ id: 'x', run: () => 'a' });
    const d = kernel.commands.register({ id: 'x', run: () => 'b' });
    expect(await kernel.execute('x')).toBe('b');
    d.dispose();
    expect(await kernel.execute('x')).toBe('a');
  });

  it('禁用的命令不执行', async () => {
    const kernel = createTestKernel();
    const run = vi.fn();
    kernel.commands.register({ id: 'x', enabled: () => false, run });
    await kernel.execute('x');
    expect(run).not.toHaveBeenCalled();
  });

  it('派发 before/after 事件', async () => {
    const kernel = createTestKernel();
    const after = vi.fn();
    kernel.bus.on('command:after', after);
    kernel.commands.register({ id: 'x', run: (_k, n: number) => n * 2 });
    await kernel.execute('x', 21);
    expect(after).toHaveBeenCalledWith({ id: 'x', args: [21], result: 42 });
  });
});

describe('historyPlugin', () => {
  it('注册撤销/重做命令并按状态启用', async () => {
    const counter = createSlice({ name: 'n', initialState: 0, history: true, reducers: { inc: (s: number) => s + 1 } });
    const { kernel, toolbar } = await setupPlugins([
      historyPlugin(),
      definePlugin({ name: 'n', setup: (ctx) => ctx.registerSlice(counter) }),
    ]);
    expect(kernel.commands.isEnabled('kabel.undo')).toBe(false);
    kernel.dispatch(counter.actions.inc());
    expect(kernel.commands.isEnabled('kabel.undo')).toBe(true);
    await kernel.execute('kabel.undo');
    expect(kernel.getState().n).toBe(0);
    expect(toolbar().map((t) => t.id)).toContain('history.undo');
  });
});

describe('插件停用与启用', () => {
  const base = definePlugin({ name: 'base', setup: (ctx) => ctx.registerCommand({ id: 'base.run', run: () => 1 }) });
  const child = definePlugin({ name: 'child', dependencies: ['base'] });
  const core = definePlugin({ name: 'core', builtin: true });

  it('停用时一并停用依赖方，保留定义；启用时一并启用依赖', async () => {
    const { kernel } = await setupPlugins([base, child, core]);
    const events = vi.fn();
    kernel.bus.on('plugin:unregistered', events);
    expect(kernel.plugins.disable('base')).toEqual(['child', 'base']);
    expect(kernel.commands.has('base.run')).toBe(false);
    expect(kernel.plugins.listDisabled().map((p) => p.name).sort()).toEqual(['base', 'child']);
    expect(events).toHaveBeenCalledWith({ name: 'base', disabled: true });

    await kernel.plugins.enable('child');
    expect(kernel.plugins.has('base') && kernel.plugins.has('child')).toBe(true);
    expect(kernel.plugins.listDisabled()).toEqual([]);
    expect(kernel.commands.has('base.run')).toBe(true);
  });

  it('内置插件不可停用；卸载后不再保留', async () => {
    const { kernel } = await setupPlugins([base, core]);
    expect(kernel.plugins.disable('core')).toEqual([]);
    expect(kernel.plugins.has('core')).toBe(true);
    kernel.plugins.disable('base');
    kernel.unuse('base');
    expect(kernel.plugins.isDisabled('base')).toBe(false);
  });

  it('依赖已卸载时启用失败，仍保留在停用列表', async () => {
    const { kernel } = await setupPlugins([base, child]);
    kernel.plugins.disable('child');
    kernel.unuse('base');
    await expect(kernel.plugins.enable('child')).rejects.toThrow(/requires "base"/);
    expect(kernel.plugins.isDisabled('child')).toBe(true);
  });
});
