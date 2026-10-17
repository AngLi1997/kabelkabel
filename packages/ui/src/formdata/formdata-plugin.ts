import { definePlugin, DIALOG_SERVICE, ExtensionPoints } from '@kabel/core';
import { FormDataView, type FormDataViewTab } from './FormDataView';

/** “查看表单数据”弹窗 id（`ExtensionPoints.dialogs`） */
export const FORM_DATA_DIALOG = 'formData.view';

/**
 * 查看表单数据：工具栏保存按钮右侧的“查看表单数据”按钮 + 底座弹窗，
 * 分两页：“表单数据”为 `ExtensionPoints.formData` 全部提供者的完整提交数据（即保存时 `save` 载荷的 `data`）；
 * “表单配置”为当前表单的配置——实例 id、插件（状态、父插件、生效配置）以及 `ExtensionPoints.formConfig`
 * 的贡献（布局、主题、表格等）。两类提供者都没有时不显示按钮。
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
        // 参数：打开的页签 `'data'`（默认）/ `'config'`
        run: (_k, tab?: FormDataViewTab) => dialogs()?.open(FORM_DATA_DIALOG, { tab }),
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
        when: (_s, k) =>
          k.extensions.get(ExtensionPoints.formData).getAll().length > 0 || k.extensions.get(ExtensionPoints.formConfig).getAll().length > 0,
      });
      ctx.onDispose(() => dialogs()?.isOpen(FORM_DATA_DIALOG) && dialogs()?.close(FORM_DATA_DIALOG));
    },
  });
