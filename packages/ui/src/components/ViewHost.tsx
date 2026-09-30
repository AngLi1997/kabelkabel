import { isDomView, shallowEqual, type DomViewInstance, type View } from '@kabel/core';
import { Component, type ComponentChildren, type FunctionComponent } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { KernelContext } from '../context';
import { Icon } from '../icons/Icon';

export interface ViewHostProps<P> {
  view: View<P>;
  props: P;
  class?: string;
}

interface BoundaryProps {
  view: unknown;
  onError(error: unknown): void;
  children?: ComponentChildren;
}

/** 错误边界：单个面板 / 视图渲染出错时只影响它自己，显示提示与重试，并派发 `error` 事件 */
class ViewErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  override state = { error: null as unknown };

  static override getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override componentDidUpdate(prev: BoundaryProps) {
    if (prev.view !== this.props.view && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <ViewError onRetry={() => this.setState({ error: null })} />;
  }
}

function ViewError({ onRetry }: { onRetry(): void }) {
  return (
    <div class="kb-view-error" role="alert">
      <Icon name="warning" />
      <span>此区域加载失败</span>
      <button type="button" class="kb-btn kb-btn--sm" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

/**
 * 渲染任意视图：Preact 函数组件直接渲染；DomView（Vue/React/原生）挂载到容器节点上，
 * 属性浅比较变化时调用 update。视图内部的异常被隔离在错误边界内。
 */
export function ViewHost<P extends object>({ view, props, class: className }: ViewHostProps<P>) {
  const kernel = useContext(KernelContext);
  const report = (error: unknown) => kernel?.bus.emit('error', { error, source: 'view' });
  return (
    <ViewErrorBoundary view={view} onError={report}>
      {isDomView(view) ? <DomViewHost view={view} props={props} class={className} onError={report} /> : <FunctionView view={view} props={props} />}
    </ViewErrorBoundary>
  );
}

function FunctionView<P extends object>({ view, props }: { view: View<P>; props: P }) {
  const Component = view as unknown as FunctionComponent<P>;
  return <Component {...props} />;
}

function DomViewHost<P extends object>({ view, props, class: className, onError }: { view: View<P>; props: P; class?: string; onError(error: unknown): void }) {
  const el = useRef<HTMLDivElement>(null);
  const instance = useRef<DomViewInstance<P> | null>(null);
  const lastProps = useRef(props);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    if (!isDomView(view) || !el.current) return;
    try {
      instance.current = view.mount(el.current, lastProps.current);
      setFailed(false);
    } catch (error) {
      onError(error);
      setFailed(true);
    }
    return () => {
      instance.current?.unmount();
      instance.current = null;
    };
  }, [view]);

  useLayoutEffect(() => {
    if (shallowEqual(lastProps.current, props)) return;
    lastProps.current = props;
    try {
      instance.current?.update?.(props);
    } catch (error) {
      onError(error);
    }
  });

  return (
    <>
      <div ref={el} class={className ?? 'kb-view-host'} hidden={failed} />
      {failed && <ViewError onRetry={() => setFailed(false)} />}
    </>
  );
}
