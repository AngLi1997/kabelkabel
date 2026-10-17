import {
  createSlice,
  definePlugin,
  DIALOG_SERVICE,
  ExtensionPoints,
  NOTIFY_SERVICE,
  uid,
  type ConfirmOptions,
  type DialogService,
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

/** 一个已打开的弹窗；内容视图取自 `ExtensionPoints.dialogs` 中同 id 的贡献项 */
export interface OpenDialog {
  id: string;
  props?: unknown;
  /** 每次打开递增，用于重新挂载（位置复位、焦点重新进入） */
  key: string;
}

export interface FeedbackState {
  toasts: Toast[];
  confirm: PendingConfirm | null;
  /** 已打开的弹窗，后者在上层 */
  dialogs: OpenDialog[];
}

declare module '@kabel/core' {
  interface KabelState {
    feedback: FeedbackState;
  }
}

export const feedbackSlice = createSlice({
  name: 'feedback',
  initialState: { toasts: [], confirm: null, dialogs: [] } as FeedbackState,
  reducers: {
    push: (s: FeedbackState, toast: Toast) => ({ ...s, toasts: [...s.toasts, toast].slice(-5) }),
    dismiss: (s: FeedbackState, id: string) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }),
    ask: (s: FeedbackState, confirm: PendingConfirm) => ({ ...s, confirm }),
    answered: (s: FeedbackState) => (s.confirm ? { ...s, confirm: null } : s),
    openDialog: (s: FeedbackState, dialog: OpenDialog) => ({ ...s, dialogs: [...s.dialogs.filter((d) => d.id !== dialog.id), dialog] }),
    updateDialog: (s: FeedbackState, { id, props }: { id: string; props: unknown }) =>
      s.dialogs.some((d) => d.id === id) ? { ...s, dialogs: s.dialogs.map((d) => (d.id === id ? { ...d, props } : d)) } : s,
    closeDialog: (s: FeedbackState, id: string) => (s.dialogs.some((d) => d.id === id) ? { ...s, dialogs: s.dialogs.filter((d) => d.id !== id) } : s),
  },
});

export const feedbackActions = feedbackSlice.actions;

const DEFAULT_DURATION: Record<NoticeType, number> = { info: 4000, success: 4000, warning: 6000, error: 6000 };

/**
 * 消息提示（右下角 toast）、确认对话框与弹窗，对外通过 `NOTIFY_SERVICE` / `DIALOG_SERVICE` 使用。
 * 弹窗的外框与行为（遮罩、拖动、关闭、焦点、层叠）统一在此定义，插件只贡献 `ExtensionPoints.dialogs` 内容视图。
 */
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

      const dialogs = () => kernel.getState().feedback.dialogs;
      const dialogRegistry = kernel.extensions.get(ExtensionPoints.dialogs);
      const closeDialog = (id: string) => {
        const open = dialogs().find((d) => d.id === id);
        if (!open) return;
        kernel.dispatch(feedbackActions.closeDialog(id));
        ctx.bus.emit('dialog:close', { id });
        try {
          dialogRegistry.get(id)?.onClose?.(kernel, open.props);
        } catch (error) {
          kernel.bus.emit('error', { error, source: `dialog:${id}` });
        }
      };
      const dialogService: DialogService = {
        open(id, props) {
          kernel.dispatch(feedbackActions.openDialog({ id, props, key: uid('dialog') }));
          ctx.bus.emit('dialog:open', { id, props });
        },
        update(id, props) {
          kernel.dispatch(feedbackActions.updateDialog({ id, props }));
        },
        close(id) {
          const target = id ?? dialogs().at(-1)?.id;
          if (target) closeDialog(target);
        },
        isOpen: (id) => dialogs().some((d) => d.id === id),
      };
      ctx.provide(DIALOG_SERVICE, dialogService);
      // 贡献弹窗的插件被停用 / 卸载时，关闭它打开的弹窗
      ctx.onDispose(
        dialogRegistry.subscribe(() => {
          for (const d of dialogs()) if (!dialogRegistry.get(d.id)) closeDialog(d.id);
        }),
      );

      ctx.registerCommand({ id: 'dialog.open', title: '打开弹窗', hidden: true, run: (_k, id: string, props?: unknown) => dialogService.open(id, props) });
      ctx.registerCommand({ id: 'dialog.close', title: '关闭弹窗', hidden: true, run: (_k, id?: string) => dialogService.close(id) });
      ctx.registerCommand({ id: 'feedback.answer', title: '回答确认框', hidden: true, run: (_k, ok: boolean) => settle(!!ok) });
      ctx.onDispose(() => {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
        settle(false);
        for (const d of [...dialogs()].reverse()) closeDialog(d.id);
      });
    },
  });
