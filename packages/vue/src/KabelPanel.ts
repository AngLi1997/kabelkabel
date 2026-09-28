import { ExtensionPoints, type Disposable, type DomView, type PanelAction, type PanelViewProps, type RegionId } from '@kabel/editor';
import { defineComponent, h, inject, onBeforeUnmount, shallowRef, Teleport, watch, type Component, type PropType } from 'vue';
import { KABEL_CONTEXT } from './context';

/**
 * 以 Vue 模板声明一个面板，内容通过 Teleport 渲染进工作台区域，
 * 因此完整保留宿主应用的响应式、provide/inject 与全局组件。
 *
 * ```vue
 * <KabelEditor ...>
 *   <KabelPanel id="host.related" region="right" title="关联文件">
 *     <RelatedFiles :archive-id="id" />
 *   </KabelPanel>
 * </KabelEditor>
 * ```
 */
export const KabelPanel = defineComponent({
  name: 'KabelPanel',
  props: {
    id: { type: String, required: true },
    title: { type: String, required: true },
    region: { type: String as PropType<RegionId>, default: 'right' },
    icon: { type: String, default: undefined },
    order: { type: Number, default: undefined },
    weight: { type: Number, default: undefined },
    actions: { type: Array as PropType<PanelAction[]>, default: undefined },
  },
  setup(props, { slots }) {
    const ctx = inject(KABEL_CONTEXT, null);
    if (!ctx) throw new Error('[kabel] <KabelPanel> must be placed inside <KabelEditor>');
    const target = shallowRef<HTMLElement | null>(null);
    let registration: Disposable | undefined;

    const view: DomView<PanelViewProps> = {
      mount(el) {
        el.classList.add('kb-vue-panel');
        target.value = el;
        return {
          unmount() {
            if (target.value === el) target.value = null;
          },
        };
      },
    };

    watch(
      [ctx.editor, () => ({ ...props })],
      ([editor]) => {
        registration?.dispose();
        registration = editor?.kernel.extensions.contribute(ExtensionPoints.panels, {
          id: props.id,
          title: props.title,
          region: props.region,
          icon: props.icon,
          order: props.order ?? 100,
          weight: props.weight,
          actions: props.actions,
          view,
        });
      },
      { immediate: true },
    );

    onBeforeUnmount(() => registration?.dispose());

    return () => (target.value ? h(Teleport as unknown as Component, { to: target.value }, slots.default?.({ editor: ctx.editor.value })) : null);
  },
});
