import { ExtensionPoints } from './contributions';
import { definePlugin } from './plugin';
import { createSlice } from './store';
import type { KabelState } from './store';

export interface ModeState {
  readonly: boolean;
}

export const modeSlice = createSlice({
  name: 'mode',
  initialState: { readonly: false } as ModeState,
  reducers: {
    setReadonly: (s: ModeState, readonly: boolean) => (s.readonly === readonly ? s : { ...s, readonly }),
  },
});

export const modeActions = modeSlice.actions;

export const isReadonly = (state: KabelState): boolean => !!state.mode?.readonly;

export interface ModePluginOptions {
  /** 初始是否只读 */
  readonly?: boolean;
}

/**
 * 只读模式：全局 `mode.readonly` 状态。声明了 `mutates: true` 的命令在只读时自动禁用，
 * 面板与字段视图用 `isReadonly(state)`（或 ui 的 `useReadonly()`）决定是否可编辑。
 */
export const modePlugin = (options: ModePluginOptions = {}) =>
  definePlugin({
    name: 'kabel:mode',
    title: '只读模式',
    builtin: true,
    setup(ctx) {
      ctx.registerSlice(modeSlice, { readonly: !!options.readonly });
      ctx.registerCommand({
        id: 'kabel.setReadonly',
        title: '切换只读',
        hidden: true,
        checked: (k) => isReadonly(k.getState()),
        run: (k, readonly?: boolean) => k.dispatch(modeActions.setReadonly(readonly ?? !isReadonly(k.getState()))),
      });
      ctx.watch(
        (s) => isReadonly(s),
        (readonly) => ctx.bus.emit('mode:change', { readonly }),
      );
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'mode.readonly',
        align: 'left',
        order: 1,
        icon: 'eye',
        text: (s) => (isReadonly(s) ? '只读' : null),
        tooltip: '当前为只读模式，无法修改',
      });
    },
  });
