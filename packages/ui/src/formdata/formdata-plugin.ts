import { createSlice, definePlugin, ExtensionPoints } from '@kabel/core';

export interface FormDataViewState {
  open: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    formDataView: FormDataViewState;
  }
}

export const formDataViewSlice = createSlice({
  name: 'formDataView',
  initialState: { open: false } as FormDataViewState,
  reducers: {
    open: (s: FormDataViewState) => (s.open ? s : { open: true }),
    close: (s: FormDataViewState) => (s.open ? { open: false } : s),
  },
});

export const formDataViewActions = formDataViewSlice.actions;

/**
 * 查看表单数据：工具栏保存按钮右侧的“查看表单数据”按钮 + 只读弹窗，
 * 展示 `ExtensionPoints.formData` 中全部提供者的完整提交数据（即保存时 `save` 载荷的 `data`）。
 * 没有任何提供者时不显示按钮。
 */
export const formDataViewPlugin = () =>
  definePlugin({
    name: 'kabel:form-data',
    title: '查看表单数据',
    builtin: true,
    setup(ctx) {
      ctx.registerSlice(formDataViewSlice);
      ctx.registerCommand({
        id: 'formData.show',
        title: '查看表单数据',
        icon: 'code',
        checked: (k) => k.getState().formDataView.open,
        run: (k) => k.dispatch(formDataViewActions.open()),
      });
      ctx.registerCommand({
        id: 'formData.close',
        hidden: true,
        title: '关闭表单数据',
        run: (k) => k.dispatch(formDataViewActions.close()),
      });
      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'formData.show',
        icon: 'code',
        label: '查看表单数据',
        command: 'formData.show',
        order: 11,
        when: (_s, k) => k.extensions.get(ExtensionPoints.formData).getAll().length > 0,
      });
      ctx.onDispose(() => ctx.kernel.dispatch(formDataViewActions.close()));
    },
  });
