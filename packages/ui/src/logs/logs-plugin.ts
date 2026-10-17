import {
  createSlice,
  definePlugin,
  ExtensionPoints,
  LOG_SERVICE,
  REGISTER_ACTION,
  RESTORE_ACTION,
  Schema,
  UNREGISTER_ACTION,
  type Kernel,
  type LogExportFormat,
  type LogService,
} from '@kabel/core';
import { downloadFile } from '../utils';
import { LogPanel } from './LogPanel';
import { LogStatus } from './LogStatus';
import { exportLogs, LogRecorder, type LogRule } from './recorder';

export interface LogsState {
  /** 日志看板是否展开 */
  open: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    logs: LogsState;
  }
}

export const logsSlice = createSlice({
  name: 'logs',
  initialState: { open: false } as LogsState,
  reducers: {
    toggle: (s: LogsState, open?: boolean) => {
      const next = open ?? !s.open;
      return next === s.open ? s : { open: next };
    },
  },
});

export const logsActions = logsSlice.actions;

const LEVEL = Schema.union([
  Schema.const('debug').description('调试'),
  Schema.const('info').description('信息'),
  Schema.const('warning').description('警告'),
  Schema.const('error').description('错误'),
]);

const FORMAT = Schema.union([
  Schema.const('text').description('文本（.log）'),
  Schema.const('csv').description('表格（.csv）'),
  Schema.const('json').description('JSON（.json）'),
]);

export interface LogsConfig {
  capacity: number;
  format: LogExportFormat;
  actions: boolean;
  rules: LogRule[];
}

/** 默认事件规则：内置事件的中文名称与级别；高频事件默认不记录 */
export const DEFAULT_LOG_RULES: LogRule[] = [
  { event: 'command:before', label: '开始执行命令', record: false },
  { event: 'command:after', label: '执行命令' },
  { event: 'command:error', label: '命令失败', level: 'error' },
  { event: 'plugin:registered', label: '插件启用' },
  { event: 'plugin:unregistered', label: '插件停用' },
  { event: 'plugin:status', label: '插件状态', level: 'debug' },
  { event: 'plugin:config', label: '插件配置' },
  { event: 'service:change', label: '服务变更', level: 'debug' },
  { event: 'error', label: '错误', level: 'error' },
  { event: 'save', label: '保存' },
  { event: 'saved', label: '保存成功' },
  { event: 'save:error', label: '保存失败', level: 'error' },
  { event: 'mode:change', label: '只读模式' },
  { event: 'document:change', label: '切换文件' },
  { event: 'region:change', label: '框选中', record: false },
  { event: 'field:focus', label: '字段聚焦', level: 'debug' },
];

export const LogsConfig: Schema<Partial<LogsConfig>, LogsConfig> = Schema.object({
  capacity: Schema.natural().min(50).max(20000).default(2000).description('最多保留条数'),
  format: FORMAT.default('text').description('下载格式'),
  actions: Schema.boolean().default(false).description('记录状态变更（action）'),
  rules: Schema.array(
    Schema.object({
      event: Schema.string().required().description('事件（支持 * 通配）'),
      label: Schema.string().description('显示名称'),
      level: LEVEL.description('级别'),
      record: Schema.boolean().default(true).description('记录'),
      emit: Schema.string().description('转发为自定义事件'),
    }),
  )
    .role('table')
    .default(DEFAULT_LOG_RULES as never)
    .description('事件规则'),
}) as never;

/** 日志在插件重载（保存配置）后保留 */
const recorders = new WeakMap<Kernel, LogRecorder>();

export const recorderOf = (kernel: Kernel): LogRecorder => {
  let recorder = recorders.get(kernel);
  if (!recorder) recorders.set(kernel, (recorder = new LogRecorder()));
  return recorder;
};

/** 显示名：插件标题，宿主或渲染层直接派发的事件为“宿主” */
export const sourceTitle = (kernel: Kernel, name?: string): string => {
  if (!name) return '宿主';
  return kernel.plugins.get(name)?.title ?? kernel.plugins.listDisabled().find((p) => p.name === name)?.title ?? name;
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const MIME: Record<LogExportFormat, [string, string]> = {
  text: ['log', 'text/plain;charset=utf-8'],
  csv: ['csv', 'text/csv;charset=utf-8'],
  json: ['json', 'application/json;charset=utf-8'],
};

/**
 * 事件日志：记录所有组件（插件）触发的事件——时间戳、来源插件、事件名与摘要。
 *
 * - 状态栏右下角“日志”按钮展开 / 收起最右侧的日志看板（抽屉）；
 * - 插件经 `ctx.bus` / `ctx.emit` 派发的事件自动标注来源，命令、插件生命周期、服务变化默认都会记录；
 * - 设置 › 插件管理 › 事件日志 › 配置 中可按事件修改显示名称、级别、是否记录，或转发为自定义事件；
 * - 日志可下载为文本 / CSV / JSON；对外通过 `LOG_SERVICE` 读写。
 */
export const logsPlugin = (options: Partial<LogsConfig> = {}) =>
  definePlugin<LogsConfig>({
    name: 'kabel:logs',
    title: '事件日志',
    Config: LogsConfig,
    config: options,
    setup(ctx, config) {
      const { kernel } = ctx;
      const recorder = recorderOf(kernel);
      recorder.options = { capacity: config.capacity, rules: config.rules };
      ctx.registerSlice(logsSlice);

      // 转发的自定义事件不再触发转发，避免规则互相引用时死循环
      let forwarding = false;
      ctx.onDispose(
        kernel.bus.onAny((type, payload, meta) => {
          const rule = recorder.record(kernel, type, payload, meta);
          const target = rule?.emit?.trim();
          if (!target || forwarding || target === type) return;
          forwarding = true;
          try {
            kernel.bus.emitAs(meta.source, target, payload);
          } finally {
            forwarding = false;
          }
        }),
      );

      if (config.actions) {
        const internal = new Set([REGISTER_ACTION, UNREGISTER_ACTION, RESTORE_ACTION]);
        ctx.onDispose(
          kernel.store.subscribe((_state, _prev, action) => {
            if (internal.has(action.type)) return;
            recorder.add({ type: 'action', label: action.type, level: 'debug', source: undefined, message: action.type });
          }),
        );
      }

      const titleOf = (name?: string) => sourceTitle(kernel, name);
      const service: LogService = {
        list: () => recorder.list(),
        log: (input) => recorder.add({ ...input, type: input.type ?? 'log', source: input.source }),
        clear: () => recorder.clear(),
        subscribe: (listener) => recorder.subscribe(listener),
        export: (format, entries = recorder.list()) => exportLogs(entries, format, titleOf),
        download(format = config.format, entries = recorder.list()) {
          const [ext, type] = MIME[format];
          downloadFile(`kabel-logs-${stamp()}.${ext}`, exportLogs(entries, format, titleOf), type);
        },
      };
      ctx.provide(LOG_SERVICE, service);

      // 展开看板即视为已查看错误
      ctx.watch(
        (s) => s.logs?.open,
        (open) => open && recorder.markSeen(),
      );

      ctx.registerCommand({
        id: 'logs.toggle',
        title: '日志看板',
        icon: 'log',
        keybinding: 'Mod+Shift+L',
        checked: (k) => !!k.getState().logs?.open,
        run: (k, open?: boolean) => k.dispatch(logsActions.toggle(typeof open === 'boolean' ? open : undefined)),
      });
      ctx.registerCommand({ id: 'logs.close', title: '关闭日志看板', hidden: true, run: (k) => k.dispatch(logsActions.toggle(false)) });
      ctx.registerCommand({ id: 'logs.clear', title: '清空日志', icon: 'trash', run: () => service.clear() });
      ctx.registerCommand({
        id: 'logs.download',
        title: '下载日志',
        icon: 'download',
        run: (_k, format?: LogExportFormat) => service.download(format && format in MIME ? format : undefined),
      });
      ctx.registerCommand({
        id: 'logs.pause',
        title: '暂停 / 继续记录日志',
        icon: 'pause',
        checked: () => recorder.paused,
        run: () => recorder.setPaused(!recorder.paused),
      });

      ctx.contribute(ExtensionPoints.statusbar, { id: 'logs', align: 'right', order: 10000, view: LogStatus });
      ctx.contribute(ExtensionPoints.drawers, {
        id: 'logs',
        title: '日志',
        icon: 'log',
        width: 420,
        view: LogPanel,
        when: (s) => !!s.logs?.open,
        close: (k) => k.execute('logs.close'),
      });
    },
  });
