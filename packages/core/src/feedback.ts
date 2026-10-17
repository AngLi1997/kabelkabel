import { createServiceToken } from './services';

export type NoticeType = 'info' | 'success' | 'warning' | 'error';

export interface NotifyOptions {
  type?: NoticeType;
  /** 自动关闭的毫秒数，`0` 表示不自动关闭；默认 info/success 4000、warning/error 6000 */
  duration?: number;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  okText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮使用警示色 */
  danger?: boolean;
}

/** 消息提示与确认对话框。实现由渲染层提供（ui 的 feedbackPlugin），插件通过令牌使用。 */
export interface NotifyService {
  /** 显示一条提示，返回其 id */
  notify(message: string, options?: NotifyOptions): string;
  dismiss(id: string): void;
  /** 弹出确认框，用户确认返回 true，取消 / Esc / 点击遮罩返回 false */
  confirm(options: ConfirmOptions | string): Promise<boolean>;
}

export const NOTIFY_SERVICE = createServiceToken<NotifyService>('kabel.notify');

/**
 * 弹窗服务：打开 / 关闭 `ExtensionPoints.dialogs` 中贡献的弹窗。实现由渲染层提供（ui 的 feedbackPlugin）。
 * 弹窗外框与交互统一由底座定义，插件只贡献内容视图并经此服务（或命令 `dialog.open` / `dialog.close`）触发。
 */
export interface DialogService {
  /** 打开弹窗；已打开时更新参数并移到最上层 */
  open<P = unknown>(id: string, props?: P): void;
  /** 更新已打开弹窗的参数；未打开时忽略 */
  update<P = unknown>(id: string, props: P): void;
  /** 关闭弹窗，缺省关闭最上层的一个；不检查 `closable` */
  close(id?: string): void;
  isOpen(id: string): boolean;
}

export const DIALOG_SERVICE = createServiceToken<DialogService>('kabel.dialog');
