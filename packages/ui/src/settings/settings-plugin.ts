import { createSlice, definePlugin, ExtensionPoints } from '@kabel/core';
import { PluginsPage } from './PluginsPage';

export interface SettingsState {
  open: boolean;
  /** 当前分类页 id，为空时显示第一个 */
  page: string | null;
}

declare module '@kabel/core' {
  interface KabelState {
    settings: SettingsState;
  }
}

export const settingsSlice = createSlice({
  name: 'settings',
  initialState: { open: false, page: null } as SettingsState,
  reducers: {
    open: (s: SettingsState, page?: string | null) => ({ open: true, page: page ?? s.page }),
    close: (s: SettingsState) => (s.open ? { ...s, open: false } : s),
    setPage: (s: SettingsState, page: string) => (s.page === page ? s : { ...s, page }),
  },
});

export const settingsActions = settingsSlice.actions;

/** 设置：工具栏右侧设置按钮 + 设置弹窗（分类页来自扩展点 `ExtensionPoints.settings`），内置插件管理页 */
export const settingsPlugin = () =>
  definePlugin({
    name: 'kabel:settings',
    title: '设置',
    builtin: true,
    setup(ctx) {
      ctx.registerSlice(settingsSlice);
      ctx.registerCommand({
        id: 'settings.open',
        title: '设置',
        icon: 'settings',
        checked: (k) => k.getState().settings.open,
        run: (k, page?: string) => k.dispatch(settingsActions.open(page)),
      });
      ctx.registerCommand({
        id: 'settings.close',
        hidden: true,
        title: '关闭设置',
        run: (k) => k.dispatch(settingsActions.close()),
      });
      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'settings.open',
        group: 'end',
        icon: 'settings',
        tooltip: '设置',
        command: 'settings.open',
        order: 1000,
      });
      ctx.contribute(ExtensionPoints.settings, { id: 'plugins', title: '插件管理', icon: 'plugin', order: 10, view: PluginsPage });
    },
  });
