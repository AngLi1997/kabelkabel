import { createSlice, definePlugin, ExtensionPoints } from '@kabel/core';
import { ShortcutsPage } from './ShortcutsPage';

export interface KeymapState {
  /** 用户改绑：命令 id → 快捷键列表（空数组表示已清除默认快捷键） */
  overrides: Record<string, string[]>;
}

declare module '@kabel/core' {
  interface KabelState {
    keymap: KeymapState;
  }
}

export const keymapSlice = createSlice({
  name: 'keymap',
  initialState: { overrides: {} } as KeymapState,
  reducers: {
    set: (s: KeymapState, p: { id: string; bindings: string[] }) => ({ overrides: { ...s.overrides, [p.id]: p.bindings } }),
    reset: (s: KeymapState, id: string) => {
      if (!(id in s.overrides)) return s;
      const { [id]: _removed, ...rest } = s.overrides;
      return { overrides: rest };
    },
    resetAll: (s: KeymapState) => (Object.keys(s.overrides).length ? { overrides: {} } : s),
  },
});

export const keymapActions = keymapSlice.actions;

const STORAGE_KEY = 'overrides.v1';

/** 丢弃存储中的非法数据 */
export function sanitizeOverrides(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [id, bindings] of Object.entries(value)) {
    if (Array.isArray(bindings) && bindings.every((b) => typeof b === 'string')) out[id] = bindings as string[];
  }
  return out;
}

/** 快捷键：用户可在 设置 › 快捷键 中改绑命令，改绑持久化，冲突时提示 */
export const keymapPlugin = () =>
  definePlugin({
    name: 'kabel:keymap',
    title: '快捷键',
    builtin: true,
    setup(ctx) {
      const saved = sanitizeOverrides(ctx.storage.get<unknown>(STORAGE_KEY, {}));
      ctx.registerSlice(keymapSlice, { overrides: saved });
      ctx.watch(
        (s) => s.keymap?.overrides,
        (overrides) => ctx.storage.set(STORAGE_KEY, overrides ?? {}),
      );
      ctx.contribute(ExtensionPoints.settings, { id: 'shortcuts', title: '快捷键', icon: 'keyboard', order: 15, view: ShortcutsPage });
    },
  });
