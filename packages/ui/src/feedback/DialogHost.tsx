import { DIALOG_SERVICE, ExtensionPoints, type DialogContribution } from '@kabel/core';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { useDraggable } from '../components/draggable';
import { ViewHost } from '../components/ViewHost';
import { useContributions, useKernel, useSelector } from '../hooks';
import { cx } from '../utils';
import type { OpenDialog } from './feedback-plugin';

/** 打开弹窗时优先聚焦的元素：第一个可输入的表单控件，否则聚焦弹窗本身 */
const AUTOFOCUS = '[data-kb-autofocus], input:not([type="hidden"]):not([type="file"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)';

/** 底座弹窗的渲染出口：按 `state.feedback.dialogs` 顺序层叠渲染 `ExtensionPoints.dialogs` 中的内容视图 */
export function DialogHost() {
  const dialogs = useSelector((s) => s.feedback?.dialogs);
  const contributions = useContributions(ExtensionPoints.dialogs);
  if (!dialogs?.length) return null;
  return (
    <>
      {dialogs.map((open) => {
        const dialog = contributions.find((c) => c.id === open.id);
        return dialog ? <DialogFrame key={open.key} dialog={dialog} open={open} /> : null;
      })}
    </>
  );
}

function DialogFrame({ dialog, open }: { dialog: DialogContribution; open: OpenDialog }) {
  const kernel = useKernel();
  const box = useRef<HTMLDivElement>(null);
  const drag = useDraggable(box);
  const titleId = `kb-dialog-title-${kernel.id}-${open.key}`;
  const title = useSelector((s) => (typeof dialog.title === 'function' ? dialog.title(open.props, s) : dialog.title));
  const closable = useSelector((s) => (dialog.closable ? dialog.closable(s, kernel, open.props) : true));
  const close = useCallback(() => kernel.services.tryGet(DIALOG_SERVICE)?.close(open.id), [kernel, open.id]);
  const dismiss = () => closable && close();
  const props = useMemo(() => ({ kernel, dialogId: open.id, props: open.props, close }), [kernel, open.id, open.props, close]);

  // 打开时焦点进入弹窗，关闭后归还给打开前的元素
  useEffect(() => {
    const el = box.current;
    const previous = el?.ownerDocument.activeElement as HTMLElement | null;
    (el?.querySelector<HTMLElement>(AUTOFOCUS) ?? el)?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div class="kb-modal" onPointerDown={(e) => e.target === e.currentTarget && dialog.maskClosable !== false && dismiss()}>
      <div
        ref={box}
        class="kb-dialog"
        data-dialog={open.id}
        style={{ width: `${dialog.width ?? 480}px`, ...drag.style }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          dismiss();
        }}
      >
        <header {...drag.handleProps} class={cx('kb-dialog__header', drag.handleProps.class)} onDblClick={drag.reset}>
          <span id={titleId} class="kb-dialog__title">
            {title}
          </span>
          <IconButton icon="close" title="关闭 (Esc)" disabled={!closable} onClick={dismiss} />
        </header>
        <div class="kb-dialog__main">
          <ViewHost view={dialog.view} props={props} class="kb-dialog__view" />
        </div>
      </div>
    </div>
  );
}

/** 弹窗内容区：可滚动，带统一内边距 */
export function DialogBody({ children, class: className }: { children?: ComponentChildren; class?: string }) {
  return <div class={cx('kb-dialog__body', className)}>{children}</div>;
}

/** 弹窗底部操作栏：按钮右对齐，不随内容滚动 */
export function DialogFooter({ children, class: className }: { children?: ComponentChildren; class?: string }) {
  return <footer class={cx('kb-dialog__footer', className)}>{children}</footer>;
}
