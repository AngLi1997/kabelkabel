import { createServiceToken } from './services';
import type { Unsubscribe } from './utils';

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

/** 一条日志：时间戳 + 触发来源（插件名）+ 事件 */
export interface LogEntry {
  id: number;
  /** 毫秒时间戳 */
  time: number;
  /** 事件名，如 `command:after`、`field:change`；手动写入的日志为 `log` */
  type: string;
  /** 显示名称（事件规则中的自定义名称，缺省为事件名） */
  label: string;
  level: LogLevel;
  /** 触发事件的插件名；宿主或渲染层直接派发时为空 */
  source?: string;
  /** 摘要文本 */
  message: string;
  /** 事件载荷（已转换为可序列化的数据） */
  payload?: unknown;
}

export interface LogInput {
  type?: string;
  label?: string;
  level?: LogLevel;
  source?: string;
  message: string;
  payload?: unknown;
}

export type LogExportFormat = 'json' | 'text' | 'csv';

/** 日志服务：记录全部组件触发的事件，供日志看板显示与下载。实现由 ui 的 `logsPlugin` 提供。 */
export interface LogService {
  list(): readonly LogEntry[];
  /** 手动写入一条日志 */
  log(input: LogInput): LogEntry | undefined;
  clear(): void;
  /** 日志变化（新增、清空） */
  subscribe(listener: () => void): Unsubscribe;
  /** 导出为文本；`entries` 缺省为全部日志 */
  export(format: LogExportFormat, entries?: readonly LogEntry[]): string;
  /** 下载为文件 */
  download(format?: LogExportFormat, entries?: readonly LogEntry[]): void;
}

export const LOG_SERVICE = createServiceToken<LogService>('kabel.log');
