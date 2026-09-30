import {
  createSlice,
  definePlugin,
  NOTIFY_SERVICE,
  uid,
  type ConfirmOptions,
  type NoticeType,
  type NotifyOptions,
  type NotifyService,
} from '@kabel/core';

export interface Toast {
  id: string;
  message: string;
  type: NoticeType;
}

export interface PendingConfirm extends ConfirmOptions {
  id: string;
}

export interface FeedbackState {
  toasts: Toast[];
  confirm: PendingConfirm | null;
}

declare module '@kabel/core' {
  interface KabelState {
    feedback: FeedbackState;
  }
}

export const feedbackSlice = createSlice({
  name: 'feedback',
  initialState: { toasts: [], confirm: null } as FeedbackState,
  reducers: {
    push: (s: FeedbackState, toast: Toast) => ({ ...s, toasts: [...s.toasts, toast].slice(-5) }),
    dismiss: (s: FeedbackState, id: string) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }),
    ask: (s: FeedbackState, confirm: PendingConfirm) => ({ ...s, confirm }),
    answered: (s: FeedbackState) => (s.confirm ? { ...s, confirm: null } : s),
  },
});

export const feedbackActions = feedbackSlice.actions;

const DEFAULT_DURATION: Record<NoticeType, number> = { info: 4000, success: 4000, warning: 6000, error: 6000 };

/** 消息提示（右下角 toast）与确认对话框，对外通过 `NOTIFY_SERVICE` 使用 */
export const feedbackPlugin = () =>
  definePlugin({
    name: 'kabel:feedback',
    title: '消息与对话框',
    builtin: true,
    setup(ctx) {
      const { kernel } = ctx;
      ctx.registerSlice(feedbackSlice);
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      let resolveConfirm: ((ok: boolean) => void) | null = null;

      const dismiss = (id: string) => {
        clearTimeout(timers.get(id));
        timers.delete(id);
        kernel.dispatch(feedbackActions.dismiss(id));
      };
      const settle = (ok: boolean) => {
        const resolve = resolveConfirm;
        resolveConfirm = null;
        kernel.dispatch(feedbackActions.answered());
        resolve?.(ok);
      };

      const service: NotifyService = {
        notify(message, options: NotifyOptions = {}) {
          const type = options.type ?? 'info';
          const id = uid('toast');
          kernel.dispatch(feedbackActions.push({ id, message, type }));
          const duration = options.duration ?? DEFAULT_DURATION[type];
          if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration));
          return id;
        },
        dismiss,
        confirm(options) {
          // 新的确认框会取消尚未回答的上一个
          settle(false);
          const opts = typeof options === 'string' ? { message: options } : options;
          return new Promise<boolean>((resolve) => {
            resolveConfirm = resolve;
            kernel.dispatch(feedbackActions.ask({ ...opts, id: uid('confirm') }));
          });
        },
      };
      ctx.provide(NOTIFY_SERVICE, service);

      ctx.registerCommand({ id: 'feedback.answer', title: '回答确认框', hidden: true, run: (_k, ok: boolean) => settle(!!ok) });
      ctx.onDispose(() => {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
        settle(false);
      });
    },
  });
