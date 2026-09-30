import { NOTIFY_SERVICE, type NoticeType } from '@kabel/core';
import { useEffect, useRef } from 'preact/hooks';
import { Button, IconButton } from '../components/Button';
import { useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';

const ICONS: Record<NoticeType, string> = { info: 'info', success: 'success', warning: 'warning', error: 'error' };

/** 提示与确认对话框的渲染出口，由 Workbench 挂载 */
export function FeedbackHost() {
  return (
    <>
      <Toasts />
      <ConfirmDialog />
    </>
  );
}

function Toasts() {
  const kernel = useKernel();
  const toasts = useSelector((s) => s.feedback?.toasts);
  if (!toasts?.length) return null;
  return (
    <div class="kb-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} class={cx('kb-toast', `kb-toast--${toast.type}`)}>
          <Icon name={ICONS[toast.type]} />
          <span class="kb-toast__text">{toast.message}</span>
          <IconButton icon="close" title="关闭" onClick={() => kernel.services.tryGet(NOTIFY_SERVICE)?.dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog() {
  const kernel = useKernel();
  const confirm = useSelector((s) => s.feedback?.confirm);
  const dialog = useRef<HTMLDivElement>(null);
  const answer = (ok: boolean) => void kernel.execute('feedback.answer', ok);

  useEffect(() => {
    if (!confirm) return;
    const previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, [confirm?.id]);

  if (!confirm) return null;
  return (
    <div class="kb-modal" onPointerDown={(e) => e.target === e.currentTarget && answer(false)}>
      <div
        ref={dialog}
        class="kb-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={confirm.title ?? '确认'}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            answer(false);
          } else if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault();
            answer(true);
          }
        }}
      >
        {confirm.title && <div class="kb-confirm__title">{confirm.title}</div>}
        <div class="kb-confirm__message">{confirm.message}</div>
        <div class="kb-confirm__actions">
          <Button onClick={() => answer(false)}>{confirm.cancelText ?? '取消'}</Button>
          <Button variant={confirm.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {confirm.okText ?? '确定'}
          </Button>
        </div>
      </div>
    </div>
  );
}
