import { createSlice, definePlugin } from '@kabel/core';

export interface PaletteState {
  open: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    palette: PaletteState;
  }
}

export const paletteSlice = createSlice({
  name: 'palette',
  initialState: { open: false } as PaletteState,
  reducers: {
    open: (s: PaletteState) => (s.open ? s : { open: true }),
    close: (s: PaletteState) => (s.open ? { open: false } : s),
  },
});

export const paletteActions = paletteSlice.actions;

/** 命令面板：`Mod+Shift+P`（macOS ⌘⇧P / 其他平台 Ctrl+Shift+P）搜索并执行任意命令 */
export const palettePlugin = () =>
  definePlugin({
    name: 'kabel:palette',
    title: '命令面板',
    builtin: true,
    setup(ctx) {
      ctx.registerSlice(paletteSlice);
      ctx.registerCommand({
        id: 'palette.open',
        title: '命令面板',
        icon: 'command',
        keybinding: 'Mod+Shift+P',
        checked: (k) => !!k.getState().palette?.open,
        run: (k) => k.dispatch(paletteActions.open()),
      });
      ctx.registerCommand({ id: 'palette.close', title: '关闭命令面板', hidden: true, run: (k) => k.dispatch(paletteActions.close()) });
    },
  });
