import type { DomView, Kernel } from '@kabel/editor';
import { h, render, type Component } from 'vue';
import { VUE_APP_CONTEXT } from './context';

/**
 * 将 Vue 组件包装为框架无关的 DomView，可用于面板、字段类型、工具栏/状态栏视图。
 * 视图属性（如 `kernel`、`value`、`onChange`）会作为 props 传入组件。
 *
 * ```ts
 * ctx.contribute(ExtensionPoints.panels, { id: 'x', region: 'right', title: '关联文件', view: vueView(RelatedFiles) });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 视图属性由使用处的扩展点决定
export function vueView<P extends object = any>(
  component: Component,
  extraProps: Record<string, unknown> = {},
): DomView<P> {
  return {
    mount(el, props) {
      const kernel = (props as { kernel?: Kernel }).kernel;
      const appContext = kernel?.services.tryGet(VUE_APP_CONTEXT) ?? null;
      const draw = (next: P) => {
        const vnode = h(component, { ...extraProps, ...next });
        vnode.appContext = appContext;
        render(vnode, el);
      };
      draw(props);
      return {
        update: draw,
        unmount: () => render(null, el),
      };
    },
  };
}
