import { definePlugin, DIALOG_SERVICE, ExtensionPoints } from '@kabel/core';
import { FormDataView } from './FormDataView';

/** “查看表单数据”弹窗 id（`ExtensionPoints.dialogs`） */
export const FORM_DATA_DIALOG = 'formData.view';

/**
 * 查看表单数据：工具栏保存按钮右侧的“查看表单数据”按钮 + 底座弹窗，
 * 展示 `ExtensionPoints.formData` 中全部提供者的完整提交数据（即保存时 `save` 载荷的 `data`）。
 * 没有任何提供者时不显示按钮。
 */
export const formDataViewPlugin = () =>
  definePlugin({
    name: 'kabel:form-data',
    title: '查看表单数据',
    builtin: true,
    setup(ctx) {
      const dialogs = () => ctx.kernel.services.tryGet(DIALOG_SERVICE);
      ctx.contribute(ExtensionPoints.dialogs, { id: FORM_DATA_DIALOG, title: '表单数据', width: 880, view: FormDataView });
      ctx.registerCommand({
        id: 'formData.show',
        title: '查看表单数据',
        icon: 'code',
        run: () => dialogs()?.open(FORM_DATA_DIALOG),
      });
      ctx.registerCommand({
        id: 'formData.close',
        hidden: true,
        title: '关闭表单数据',
        run: () => dialogs()?.close(FORM_DATA_DIALOG),
      });
      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'formData.show',
        icon: 'code',
        label: '查看表单数据',
        command: 'formData.show',
        order: 11,
        when: (_s, k) => k.extensions.get(ExtensionPoints.formData).getAll().length > 0,
      });
      ctx.onDispose(() => dialogs()?.isOpen(FORM_DATA_DIALOG) && dialogs()?.close(FORM_DATA_DIALOG));
    },
  });
