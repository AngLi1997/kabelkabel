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
