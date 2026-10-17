import { describe, expect, it, vi } from 'vitest';
import { createServiceToken, definePlugin, ExtensionPoints, Schema } from '../src';
import { createTestKernel, setupPlugins } from '../src/testing';

const DB = createServiceToken<{ name: string }>('test.db');
const OCR = createServiceToken<{ name: string }>('test.ocr');

const provider = (name: string, token = DB, value = { name }) =>
  definePlugin({ name, setup: (ctx) => ctx.provide(token, value) });

describe('inject：服务依赖', () => {
  it('必需服务未就绪时等待，提供后自动启用，撤回后回到等待', async () => {
    const setup = vi.fn();
    const consumer = definePlugin({ name: 'consumer', inject: [DB], setup });
    const { kernel } = await setupPlugins(consumer);
    expect(kernel.plugins.status('consumer')).toBe('pending');
    expect(kernel.plugins.blockers('consumer')).toEqual(['test.db']);
    expect(setup).not.toHaveBeenCalled();

    await kernel.use(provider('db'));
    expect(kernel.plugins.status('consumer')).toBe('active');
    expect(setup).toHaveBeenCalledTimes(1);

    kernel.unuse('db');
    expect(kernel.plugins.status('consumer')).toBe('pending');
    expect(kernel.plugins.has('consumer')).toBe(true);
  });

  it('同批注册与书写顺序无关', async () => {
    const setup = vi.fn();
    const { kernel } = await setupPlugins([definePlugin({ name: 'c', inject: [DB], setup }), provider('db')]);
    expect(kernel.plugins.status('c')).toBe('active');
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('等待中的插件不注册任何贡献项，启用后出现，停下时释放', async () => {
    const consumer = definePlugin({
      name: 'c',
      inject: [DB],
      setup: (ctx) => ctx.contribute(ExtensionPoints.toolbar, { id: 'c.btn' }),
    });
    const { kernel, toolbar } = await setupPlugins(consumer);
    expect(toolbar()).toHaveLength(0);
    await kernel.use(provider('db'));
    expect(toolbar()).toHaveLength(1);
    kernel.unuse('db');
    expect(toolbar()).toHaveLength(0);
  });

  it('可选服务不阻塞启用，服务变化时重载（setup 中缓存服务是安全的）', async () => {
    const seen: (string | undefined)[] = [];
    const consumer = definePlugin({
      name: 'c',
      inject: { optional: [OCR] },
      setup: (ctx) => void seen.push(ctx.services.tryGet(OCR)?.name),
    });
    const { kernel } = await setupPlugins(consumer);
    expect(seen).toEqual([undefined]);
    await kernel.use(provider('paddle', OCR));
    expect(seen).toEqual([undefined, 'paddle']);
    // 覆盖栈：后提供者生效，同样触发重载
    await kernel.use(provider('other', OCR));
    expect(seen.at(-1)).toBe('other');
    kernel.unuse('other');
    expect(seen.at(-1)).toBe('paddle');
  });

  it('提供者自身不因自己提供的服务重载', async () => {
    const setup = vi.fn((ctx) => ctx.provide(DB, { name: 'self' }));
    const { kernel } = await setupPlugins(definePlugin({ name: 'self', inject: { optional: [DB] }, setup }));
    expect(setup).toHaveBeenCalledTimes(1);
    expect(kernel.plugins.status('self')).toBe('active');
  });

  it('名称依赖的插件停下时，依赖方一并停下，恢复后一并启用', async () => {
    const base = definePlugin({ name: 'base', inject: [DB] });
    const ext = definePlugin({ name: 'ext', dependencies: ['base'] });
    const { kernel } = await setupPlugins([provider('db'), base, ext]);
    expect(kernel.plugins.status('ext')).toBe('active');
    kernel.unuse('db');
    expect(kernel.plugins.status('base')).toBe('pending');
    expect(kernel.plugins.status('ext')).toBe('pending');
    await kernel.use(provider('db'));
    expect(kernel.plugins.status('ext')).toBe('active');
  });
});

describe('Config：配置 Schema', () => {
  const Config = Schema.object({
    url: Schema.string().default('http://localhost'),
    retries: Schema.number().default(1),
  });

  it('setup 收到补全默认值的配置；注册方配置优先于默认值', async () => {
    const seen: unknown[] = [];
    const plugin = definePlugin({ name: 'p', Config, setup: (ctx, config) => void seen.push(config, ctx.config) });
    const kernel = createTestKernel();
    await kernel.use({ ...plugin, config: { url: 'http://10.0.0.1' } });
    expect(seen[0]).toEqual({ url: 'http://10.0.0.1', retries: 1 });
    expect(seen[1]).toBe(seen[0]);
  });

  it('updateConfig 校验、持久化并重载；非法配置被拒绝', async () => {
    const setup = vi.fn();
    const kernel = createTestKernel();
    await kernel.use(definePlugin({ name: 'p', Config, setup }));
    const events = vi.fn();
    kernel.bus.on('plugin:config', events);

    await kernel.plugins.updateConfig('p', { url: 'http://x' });
    expect(setup).toHaveBeenCalledTimes(2);
    expect(setup.mock.calls[1]![1]).toEqual({ url: 'http://x', retries: 1 });
    expect(kernel.plugins.getConfig('p')).toEqual({ url: 'http://x', retries: 1 });
    expect(kernel.plugins.hasStoredConfig('p')).toBe(true);
    expect(events).toHaveBeenCalledWith({ name: 'p', config: { url: 'http://x', retries: 1 } });

    await expect(kernel.plugins.updateConfig('p', { url: 1 })).rejects.toThrow(/expected string/);
    expect(setup).toHaveBeenCalledTimes(2);

    await kernel.plugins.resetConfig('p');
    expect(kernel.plugins.getConfig('p')).toEqual({ url: 'http://localhost', retries: 1 });
  });

  it('保存的配置在新实例中生效', async () => {
    const storage = (await import('../src')).createMemoryStorage();
    const seen: unknown[] = [];
    const plugin = definePlugin({ name: 'p', Config, setup: (_ctx, config) => void seen.push(config) });
    const a = createTestKernel({ storage, plugins: plugin });
    await a.plugins.updateConfig('p', { retries: 3 });
    createTestKernel({ storage, plugins: plugin });
    expect(seen.at(-1)).toEqual({ url: 'http://localhost', retries: 3 });
  });
});

describe('ctx.plugin：子插件', () => {
  it('子插件随父插件卸载；父插件重载时重新注册；注册方配置下发', async () => {
    const childSetup = vi.fn();
    const child = definePlugin({ name: 'child', Config: Schema.object({ x: Schema.number().default(0) }), setup: childSetup });
    const parent = definePlugin({ name: 'parent', setup: (ctx) => void ctx.plugin(child, { x: 5 }) });
    const { kernel } = await setupPlugins(parent);
    expect(kernel.plugins.status('child')).toBe('active');
    expect(kernel.plugins.parentOf('child')).toBe('parent');
    expect(childSetup.mock.calls[0]![1]).toEqual({ x: 5 });

    await kernel.plugins.reload('parent');
    expect(childSetup).toHaveBeenCalledTimes(2);

    kernel.unuse('parent');
    expect(kernel.plugins.has('child')).toBe(false);
  });

  it('用户停用的子插件在父插件重载后仍保持停用', async () => {
    const child = definePlugin({ name: 'child' });
    const parent = definePlugin({ name: 'parent', setup: (ctx) => void ctx.plugin(child) });
    const { kernel } = await setupPlugins(parent);
    kernel.plugins.disable('child');
    await kernel.plugins.reload('parent');
    expect(kernel.plugins.isDisabled('child')).toBe(true);
    await kernel.plugins.enable('child');
    expect(kernel.plugins.status('child')).toBe('active');
    await kernel.plugins.reload('parent');
    expect(kernel.plugins.status('child')).toBe('active');
  });
});

describe('ctx.scope：作用域', () => {
  it('作用域内注册的资源可单独释放，插件卸载时一并释放', async () => {
    let scope: ReturnType<Parameters<NonNullable<ReturnType<typeof definePlugin>['setup']>>[0]['scope']> | null = null;
    const plugin = definePlugin({
      name: 's',
      setup(ctx) {
        ctx.contribute(ExtensionPoints.toolbar, { id: 'keep' });
        scope = ctx.scope();
        scope.contribute(ExtensionPoints.toolbar, { id: 'scoped' });
      },
    });
    const { kernel, toolbar } = await setupPlugins(plugin);
    expect(toolbar().map((t) => t.id)).toEqual(['keep', 'scoped']);
    scope!.dispose();
    expect(toolbar().map((t) => t.id)).toEqual(['keep']);

    scope = null;
    await kernel.plugins.reload('s');
    expect(toolbar()).toHaveLength(2);
    kernel.unuse('s');
    expect(toolbar()).toHaveLength(0);
  });
});
