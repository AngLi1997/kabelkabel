import { createMemoryStorage } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it } from 'vitest';
import { createInitialLayout, isRegionCollapsed, layoutActions, layoutPlugin, resolveLayoutConfig, sanitize } from '../src';

const config = resolveLayoutConfig({ regions: { left: { size: 300, min: 200, max: 500 } } });

describe('sanitize', () => {
  const base = createInitialLayout(config);
  it('丢弃非法值并约束尺寸范围', () => {
    const next = sanitize(
      base,
      { sizes: { left: 9999, right: 'x' as unknown as number }, maximized: 'nope' as never, weights: { a: -1, b: 2 } },
      config,
    );
    expect(next.sizes).toEqual({ left: 500, right: config.right.size });
    expect(next.maximized).toBeNull();
    expect(next.weights).toEqual({ b: 2 });
  });
  it('不恢复断点与浮层等瞬时状态', () => {
    expect(sanitize(base, { breakpoint: 'sm', overlay: true } as never, config)).toMatchObject({ breakpoint: 'lg', overlay: false });
  });
});

describe('layoutPlugin', () => {
  it('折叠/最大化/重置命令', async () => {
    const { kernel, toolbar } = await setupPlugins(layoutPlugin());
    await kernel.execute('layout.toggleLeft');
    expect(kernel.getState().layout.collapsed.left).toBe(true);
    expect(kernel.commands.isChecked('layout.toggleLeft')).toBe(false);
    await kernel.execute('layout.maximize', 'main');
    expect(kernel.getState().layout.maximized).toBe('main');
    expect(kernel.commands.isEnabled('layout.restore')).toBe(true);
    await kernel.execute('layout.restore');
    await kernel.execute('layout.reset');
    expect(kernel.getState().layout.collapsed.left).toBe(false);
    expect(toolbar().map((t) => t.id)).toEqual(['layout.toggleLeft', 'layout.toggleRight', 'layout.reset']);
  });

  it('中等宽度下右侧区域切换为浮层，不改变持久化的折叠状态', async () => {
    const { kernel } = await setupPlugins(layoutPlugin());
    const cfg = resolveLayoutConfig();
    kernel.dispatch(layoutActions.setBreakpoint('md'));
    const layout = () => kernel.getState().layout;
    expect(isRegionCollapsed(layout(), 'right', cfg)).toBe(true);
    await kernel.execute('layout.toggleRight');
    expect(layout()).toMatchObject({ overlay: true, collapsed: { right: false } });
    expect(isRegionCollapsed(layout(), 'right', cfg)).toBe(false);
    kernel.dispatch(layoutActions.setBreakpoint('lg'));
    expect(layout().overlay).toBe(false);
    expect(isRegionCollapsed(layout(), 'right', cfg)).toBe(false);
  });

  it('reveal 展开区域并切换窄屏区域', async () => {
    const { kernel } = await setupPlugins(layoutPlugin());
    await kernel.execute('layout.toggleRight');
    await kernel.execute('layout.reveal', 'right');
    expect(kernel.getState().layout).toMatchObject({ collapsed: { right: false }, compactRegion: 'right' });
  });

  it('持久化到存储并按实例隔离', async () => {
    const storage = createMemoryStorage();
    const first = await setupPlugins(layoutPlugin(), { storage, instanceId: 'x' });
    first.kernel.dispatch(layoutActions.setSize({ region: 'left', size: 420 }));
    first.kernel.dispose(); // 卸载时 flush
    const second = await setupPlugins(layoutPlugin(), { storage, instanceId: 'x' });
    expect(second.kernel.getState().layout.sizes.left).toBe(420);
    const other = await setupPlugins(layoutPlugin(), { storage, instanceId: 'y' });
    expect(other.kernel.getState().layout.sizes.left).not.toBe(420);
  });

  it('persist: false 时不写存储', async () => {
    const storage = createMemoryStorage();
    const { kernel } = await setupPlugins(layoutPlugin({ persist: false }), { storage });
    kernel.dispatch(layoutActions.setSize({ region: 'left', size: 420 }));
    kernel.dispose();
    expect(storage.getItem('kabel:test:kabel:layout:state.v1')).toBeNull();
  });
});
