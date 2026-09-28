import { isDomView, shallowEqual, type DomViewInstance, type View } from '@kabel/core';
import type { FunctionComponent } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

export interface ViewHostProps<P> {
  view: View<P>;
  props: P;
  class?: string;
}

/**
 * 渲染任意视图：Preact 函数组件直接渲染；DomView（Vue/React/原生）挂载到容器节点上，
 * 属性浅比较变化时调用 update。
 */
export function ViewHost<P extends object>({ view, props, class: className }: ViewHostProps<P>) {
  if (!isDomView(view)) {
    const Component = view as unknown as FunctionComponent<P>;
    return <Component {...props} />;
  }
  return <DomViewHost view={view} props={props} class={className} />;
}

function DomViewHost<P extends object>({ view, props, class: className }: { view: View<P>; props: P; class?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const instance = useRef<DomViewInstance<P> | null>(null);
  const lastProps = useRef(props);

  useLayoutEffect(() => {
    if (!isDomView(view) || !el.current) return;
    instance.current = view.mount(el.current, lastProps.current);
    return () => {
      instance.current?.unmount();
      instance.current = null;
    };
  }, [view]);

  useLayoutEffect(() => {
    if (shallowEqual(lastProps.current, props)) return;
    lastProps.current = props;
    instance.current?.update?.(props);
  });

  return <div ref={el} class={className ?? 'kb-view-host'} />;
}
