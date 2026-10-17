import type { EmitMeta, Kernel, LogEntry, LogExportFormat, LogInput, LogLevel } from '@kabel/core';

/** 事件规则：按事件名匹配（支持 `*` 通配），第一条匹配的规则生效 */
export interface LogRule {
  /** 事件名，如 `command:after`、`region:*`、`*` */
  event: string;
  /** 显示名称，缺省为事件名 */
  label?: string;
  level?: LogLevel;
  /** 是否记录，默认 true */
  record?: boolean;
  /** 同时以该名称派发一个自定义事件（载荷与来源不变），宿主可用 `editor.on(名称)` 监听 */
  emit?: string;
}

export interface RecorderOptions {
  capacity: number;
  rules: readonly LogRule[];
}

export const LEVEL_LABELS: Record<LogLevel, string> = { debug: '调试', info: '信息', warning: '警告', error: '错误' };
export const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warning: 2, error: 3 };

const patternCache = new Map<string, RegExp>();

/** 事件名匹配：`*` 匹配任意字符 */
export function matchEvent(pattern: string, type: string): boolean {
  if (!pattern.includes('*')) return pattern === type;
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    patternCache.set(pattern, re);
  }
  return re.test(type);
}

export function findRule(rules: readonly LogRule[], type: string): LogRule | undefined {
  return rules.find((rule) => rule.event && matchEvent(rule.event.trim(), type));
}

const defaultLevel = (type: string, payload: unknown): LogLevel => {
  if (type === 'error' || type.endsWith(':error')) return 'error';
  if (type === 'plugin:status' && (payload as { status?: string })?.status === 'pending') return 'warning';
  return 'info';
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(toPlain(error));

/**
 * 转为可序列化、体积受控的数据：截断长字符串（如 base64 影像）与长数组，
 * Error / Blob / 函数 / DOM 节点转为描述，循环引用标记为 `[Circular]`。
 */
export function toPlain(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string') {
    const s = value as string;
    return s.length > 300 ? `${s.slice(0, 300)}…（共 ${s.length} 字符）` : s;
  }
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return String(value);
  if (type === 'function') return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
  if (type === 'symbol') return String(value);
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `[Blob ${value.type || 'unknown'} ${value.size}B]`;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return `[Binary ${(value as ArrayBuffer).byteLength}B]`;
  if (typeof Node !== 'undefined' && value instanceof Node) return `[${value.nodeName}]`;
  if (value instanceof Date) return value.toISOString();
  const obj = value as object;
  if (seen.has(obj)) return '[Circular]';
  if (depth >= 4) return Array.isArray(obj) ? `[Array(${obj.length})]` : '[Object]';
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const items = obj.slice(0, 50).map((v) => toPlain(v, depth + 1, seen));
      if (obj.length > 50) items.push(`…（共 ${obj.length} 项）`);
      return items;
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) out[key] = toPlain(v, depth + 1, seen);
    return out;
  } finally {
    seen.delete(obj);
  }
}

/** 事件摘要：内置事件给出可读描述，其余为载荷的紧凑 JSON */
export function summarize(kernel: Kernel, type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, any>;
  const plugin = (name: string) => kernel.plugins.get(name)?.title ?? kernel.plugins.listDisabled().find((x) => x.name === name)?.title ?? name;
  const command = (id: string) => {
    const title = kernel.commands.get(id)?.title;
    return title ? `${title}（${id}）` : id;
  };
  switch (type) {
    case 'plugin:registered':
      return `${plugin(p.name)} 已启用`;
    case 'plugin:unregistered':
      return `${plugin(p.name)} ${p.disabled ? '已停用' : '已卸载'}`;
    case 'plugin:status': {
      if (p.status === 'active') return `${plugin(p.name)} 运行中`;
      const blockers = kernel.plugins.blockers(p.name);
      return `${plugin(p.name)} 等待${blockers.length ? `：${blockers.join('、')}` : ''}`;
    }
    case 'plugin:config':
      return `${plugin(p.name)} 配置已更新`;
    case 'service:change':
      return `服务 ${p.id} ${kernel.services.hasId(p.id) ? '已提供' : '已撤回'}`;
    case 'command:before':
    case 'command:after':
      return command(p.id);
    case 'command:error':
      return `${command(p.id)}：${errorMessage(p.error)}`;
    case 'error':
    case 'save:error':
      return `${p.source ? `[${p.source}] ` : ''}${errorMessage(p.error)}`;
    case 'mode:change':
      return p.readonly ? '进入只读模式' : '退出只读模式';
    case 'ready':
      return `实例 ${p.instanceId} 已就绪`;
  }
  if (payload === undefined) return '';
  const text = typeof payload === 'string' ? payload : JSON.stringify(toPlain(payload));
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `2026-10-17 09:30:12.345` */
export function formatTime(time: number, withDate = true): string {
  const d = new Date(time);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return withDate ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock}` : clock;
}

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function exportLogs(entries: readonly LogEntry[], format: LogExportFormat, sourceTitle: (name?: string) => string): string {
  if (format === 'json') {
    return JSON.stringify(
      entries.map((e) => ({ ...e, time: new Date(e.time).toISOString(), sourceTitle: sourceTitle(e.source) })),
      null,
      2,
    );
  }
  if (format === 'csv') {
    const header = ['时间', '级别', '来源', '标识', '事件', '名称', '内容', '载荷'];
    const rows = entries.map((e) =>
      [
        formatTime(e.time),
        LEVEL_LABELS[e.level],
        sourceTitle(e.source),
        e.source ?? '',
        e.type,
        e.label,
        e.message,
        e.payload === undefined ? '' : JSON.stringify(e.payload),
      ]
        .map(csvCell)
        .join(','),
    );
    // BOM：Excel 按 UTF-8 打开中文
    return `﻿${[header.join(','), ...rows].join('\r\n')}`;
  }
  return entries
    .map((e) => {
      const label = e.label === e.type ? e.type : `${e.label}（${e.type}）`;
      return `[${formatTime(e.time)}] [${LEVEL_LABELS[e.level]}] [${sourceTitle(e.source)}] ${label}${e.message ? ` ${e.message}` : ''}`;
    })
    .join('\n');
}

/**
 * 日志记录器（与渲染无关）：环形缓冲 + 订阅。
 * 跨插件重载保留（日志插件的配置保存后会重载，日志不应随之清空）。
 */
export class LogRecorder {
  private entries: LogEntry[] = [];
  private listeners = new Set<() => void>();
  private seq = 0;
  /** 上次查看（打开看板）后新增的错误数 */
  unseenErrors = 0;
  paused = false;
  options: RecorderOptions = { capacity: 1000, rules: [] };

  list(): readonly LogEntry[] {
    return this.entries;
  }

  add(input: LogInput & { type: string }): LogEntry | undefined {
    if (this.paused) return undefined;
    const entry: LogEntry = {
      id: ++this.seq,
      time: Date.now(),
      type: input.type,
      label: input.label || input.type,
      level: input.level ?? 'info',
      source: input.source,
      message: input.message,
      payload: input.payload,
    };
    const next = [...this.entries, entry];
    const overflow = next.length - Math.max(1, this.options.capacity);
    this.entries = overflow > 0 ? next.slice(overflow) : next;
    if (entry.level === 'error') this.unseenErrors++;
    this.changed();
    return entry;
  }

  /** 记录一次事件派发；返回命中的规则（用于转发自定义事件） */
  record(kernel: Kernel, type: string, payload: unknown, meta: EmitMeta): LogRule | undefined {
    const rule = findRule(this.options.rules, type);
    if (rule?.record === false) return rule;
    this.add({
      type,
      label: rule?.label,
      level: rule?.level ?? defaultLevel(type, payload),
      source: meta.source,
      message: summarize(kernel, type, payload),
      payload: payload === undefined ? undefined : toPlain(payload),
    });
    return rule;
  }

  clear(): void {
    this.entries = [];
    this.unseenErrors = 0;
    this.changed();
  }

  markSeen(): void {
    if (!this.unseenErrors) return;
    this.unseenErrors = 0;
    this.changed();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const listener of [...this.listeners]) listener();
  }
}
