import { ExtensionPoints, type ArchiveEditor, type Disposable } from '@kabel/editor';
import { defineComponent, inject, onBeforeUnmount, watch, type PropType } from 'vue';
import { KABEL_CONTEXT } from './context';

/**
 * 以 Vue 模板声明一个工具栏按钮。
 *
 * ```vue
 * <KabelToolbarButton id="host.submit" icon="submit" label="提交审核" @click="submit" />
 * ```
 */
export const KabelToolbarButton = defineComponent({
  name: 'KabelToolbarButton',
  props: {
    id: { type: String, required: true },
    label: { type: String, default: undefined },
    icon: { type: String, default: undefined },
    tooltip: { type: String, default: undefined },
    order: { type: Number, default: 100 },
    group: { type: String as PropType<'start' | 'end'>, default: 'start' },
    primary: { type: Boolean, default: false },
    showLabel: { type: Boolean, default: undefined },
    /** 绑定已有命令（启用状态随命令），与 @click 二选一 */
    command: { type: String, default: undefined },
    /** 渲染为分隔线 */
    separator: { type: Boolean, default: false },
  },
  emits: { click: (_editor: ArchiveEditor) => true },
  setup(props, { emit }) {
    const ctx = inject(KABEL_CONTEXT, null);
    if (!ctx) throw new Error('[kabel] <KabelToolbarButton> must be placed inside <KabelEditor>');
    let registration: Disposable | undefined;
    watch(
      [ctx.editor, () => ({ ...props })],
      ([editor]) => {
        registration?.dispose();
        registration = editor?.kernel.extensions.contribute(ExtensionPoints.toolbar, {
          id: props.id,
          type: props.separator ? 'separator' : 'button',
          label: props.label,
          icon: props.icon,
          tooltip: props.tooltip,
          order: props.order,
          group: props.group,
          primary: props.primary,
          showLabel: props.showLabel,
          command: props.command,
          onClick: props.command ? undefined : () => emit('click', editor),
        });
      },
      { immediate: true },
    );
    onBeforeUnmount(() => registration?.dispose());
    return () => null;
  },
});
