import { createSlice, definePlugin } from '@kabel/core';

export interface ContextMenuState {
  open: boolean;
  /** 相对于工作台根节点的位置 */
  x: number;
  y: number;
  target: string;
  data?: string;
}

declare module '@kabel/core' {
  interface KabelState {
    contextmenu: ContextMenuState;
  }
}

export const contextMenuSlice = createSlice({
  name: 'contextmenu',
  initialState: { open: false, x: 0, y: 0, target: '*' } as ContextMenuState,
  reducers: {
    show: (_s: ContextMenuState, p: Omit<ContextMenuState, 'open'>) => ({ ...p, open: true }),
    hide: (s: ContextMenuState) => (s.open ? { ...s, open: false } : s),
  },
});

export const contextMenuActions = contextMenuSlice.actions;

/**
 * 右键菜单：给元素加 `data-kb-context="区域标识"`（可选 `data-kb-context-data`），
 * 在其上右键即显示扩展点 `ExtensionPoints.contextMenu` 中匹配该区域的菜单项。
 * 没有匹配菜单项时保留浏览器原生菜单；输入框内始终保留原生菜单。
 */
export const contextMenuPlugin = () =>
  definePlugin({
    name: 'kabel:contextmenu',
    title: '右键菜单',
    builtin: true,
    setup(ctx) {
      ctx.registerSlice(contextMenuSlice);
      ctx.registerCommand({ id: 'contextmenu.hide', title: '关闭右键菜单', hidden: true, run: (k) => k.dispatch(contextMenuActions.hide()) });
    },
  });
