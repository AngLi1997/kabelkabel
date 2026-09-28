import { ExtensionPoints } from './contributions';
import { definePlugin } from './plugin';

/** 撤销/重做命令、快捷键与工具栏按钮。历史引擎本身由内核提供，这里只是它的交互入口。 */
export const historyPlugin = () =>
  definePlugin({
    name: 'kabel:history',
    setup(ctx) {
      ctx.registerCommand({
        id: 'kabel.undo',
        title: '撤销',
        icon: 'undo',
        keybinding: 'Mod+Z',
        enabled: (k) => k.getState().history.canUndo,
        run: (k) => k.history.undo(),
      });
      ctx.registerCommand({
        id: 'kabel.redo',
        title: '重做',
        icon: 'redo',
        keybinding: ['Mod+Shift+Z', 'Mod+Y'],
        enabled: (k) => k.getState().history.canRedo,
        run: (k) => k.history.redo(),
      });
      ctx.contribute(
        ExtensionPoints.toolbar,
        { id: 'history.separator', type: 'separator', order: 19 },
        { id: 'history.undo', icon: 'undo', label: '撤销', tooltip: '撤销', command: 'kabel.undo', order: 20 },
        { id: 'history.redo', icon: 'redo', label: '重做', tooltip: '重做', command: 'kabel.redo', order: 21 },
      );
    },
  });
