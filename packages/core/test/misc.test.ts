import { describe, expect, it } from 'vitest';
import { ContributionRegistry, createMemoryStorage, formatKeybinding, matchKeybinding, ScopedStorage } from '../src';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keybinding', () => {
  it('Mod 在 mac 映射为 meta，其他平台为 ctrl', () => {
    expect(matchKeybinding(key('z', { metaKey: true }), 'Mod+Z', true)).toBe(true);
    expect(matchKeybinding(key('z', { ctrlKey: true }), 'Mod+Z', false)).toBe(true);
    expect(matchKeybinding(key('z', { ctrlKey: true, shiftKey: true }), 'Mod+Z', false)).toBe(false);
  });
  it('格式化', () => {
    expect(formatKeybinding('Mod+Shift+Z', true)).toBe('⇧⌘Z');
    expect(formatKeybinding('Mod+S', false)).toBe('Ctrl+S');
  });
});

describe('ContributionRegistry', () => {
  it('排序、同 id 覆盖与恢复、引用稳定', () => {
    const reg = new ContributionRegistry<{ id: string; order?: number; v?: number }>();
    reg.add({ id: 'b', order: 2 });
    reg.add({ id: 'a', order: 1, v: 1 });
    const override = reg.add({ id: 'a', order: 1, v: 2 });
    const list = reg.getAll();
    expect(list.map((i) => i.id)).toEqual(['a', 'b']);
    expect(list[0]!.v).toBe(2);
    expect(reg.getAll()).toBe(list);
    override.dispose();
    expect(reg.getAll()[0]!.v).toBe(1);
  });
});

describe('ScopedStorage', () => {
  it('命名空间与异常容错', () => {
    const adapter = createMemoryStorage();
    const storage = new ScopedStorage(adapter, 'kabel:x').scope('layout');
    storage.set('a', { w: 1 });
    expect(adapter.getItem('kabel:x:layout:a')).toBe('{"w":1}');
    expect(storage.get('a', null)).toEqual({ w: 1 });
    adapter.setItem('kabel:x:layout:bad', '{');
    expect(storage.get('bad', 'fallback')).toBe('fallback');
  });
});
