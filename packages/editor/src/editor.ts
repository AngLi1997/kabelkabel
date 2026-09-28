import {
  createKernel,
  type EventHandler,
  type EventName,
  type EventPayload,
  type HistoryOptions,
  type KabelEvents,
  type KabelState,
  type Kernel,
  type PluginInput,
  type RegionId,
  type StorageInput,
  type Unsubscribe,
} from '@kabel/core';
import type { InspectorPluginOptions } from '@kabel/plugin-inspector';
import {
  METADATA_SERVICE,
  type ArchiveRecord,
  type MetadataPluginOptions,
  type MetadataService,
  type RecordInput,
  type RecordValues,
  type SchemaInput,
  type ValidationResult,
} from '@kabel/plugin-metadata';
import { VIEWER_SERVICE, type ImageSourceInput, type ViewerPluginOptions } from '@kabel/plugin-viewer';
import { mountWorkbench, type IconConfig, type LayoutOptions } from '@kabel/ui';
import { createBaselinePreset } from './preset';

export type EventListeners = { [K in keyof KabelEvents]?: EventHandler<KabelEvents[K]> };

export interface EditorOptions {
  /** 著录项 Schema，支持多种写法（完整 Schema / 字段数组 / 分组数组 / JSON） */
  schema?: SchemaInput;
  /** 档案数据：`{ id, values }`、纯值对象或 JSON */
  record?: RecordInput;
  /** 影像：URL、base64、Blob、ArrayBuffer、对象或异步加载器 */
  images?: readonly ImageSourceInput[];
  readonly?: boolean;
  /** 追加的插件（编译期注册） */
  plugins?: PluginInput;
  /** 替换默认 baseline 预设；`false` 表示不使用任何预设 */
  preset?: PluginInput | false;
  layout?: LayoutOptions;
  metadata?: Omit<MetadataPluginOptions, 'schema' | 'record' | 'readonly'>;
  viewer?: Omit<ViewerPluginOptions, 'images'> | false;
  inspector?: InspectorPluginOptions | false;
  /** 实例标识，用于布局持久化命名空间；同页多实例需不同 */
  instanceId?: string;
  /** 持久化存储，默认 localStorage */
  storage?: StorageInput;
  history?: HistoryOptions;
  icons?: IconConfig;
  /** 根节点追加 class */
  class?: string;
  /** 初始事件监听 */
  on?: EventListeners;
  /** 内核创建后、插件注册前调用，可用于注入服务（如框架适配器的上下文） */
  setup?: (kernel: Kernel) => void;
}

export type SaveResult = { ok: true } | { ok: false; errors?: Record<string, string>; error?: unknown };

export interface ArchiveEditor {
  readonly kernel: Kernel;
  /** 所有插件（含异步插件）就绪 */
  readonly ready: Promise<void>;
  on<K extends EventName<KabelEvents>>(type: K, handler: EventHandler<EventPayload<KabelEvents, K>>): Unsubscribe;
  once<K extends EventName<KabelEvents>>(type: K, handler: EventHandler<EventPayload<KabelEvents, K>>): Unsubscribe;
  off<K extends EventName<KabelEvents>>(type: K, handler?: EventHandler<EventPayload<KabelEvents, K>>): void;
  emit(type: EventName<KabelEvents>, payload?: unknown): void;
  execute<T = unknown>(command: string, ...args: unknown[]): Promise<T | undefined>;
  /** 运行期注册插件 */
  use(plugin: PluginInput): Promise<void>;
  unuse(name: string): void;
  getState(): KabelState;
  subscribe(listener: (state: KabelState) => void): Unsubscribe;

  getRecord(): ArchiveRecord;
  setRecord(record: RecordInput): void;
  getValues(): RecordValues;
  setValue(key: string, value: unknown, label?: string): void;
  setValues(values: RecordValues, label?: string): void;
  setSchema(schema: SchemaInput): void;
  setImages(images: readonly ImageSourceInput[]): Promise<void>;
  setReadonly(readonly: boolean): void;
  validate(): ValidationResult;
  save(): Promise<SaveResult>;
  undo(): void;
  redo(): void;
  isDirty(): boolean;

  layout: {
    collapse(region: 'left' | 'right'): void;
    expand(region: 'left' | 'right'): void;
    toggle(region: 'left' | 'right'): void;
    maximize(region: RegionId): void;
    restore(): void;
    reset(): void;
  };

  destroy(): void;
}

function resolveTarget(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') return target;
  const el = globalThis.document?.querySelector<HTMLElement>(target);
  if (!el) throw new Error(`[kabel] mount target "${target}" not found`);
  return el;
}

/**
 * 创建档案著录工具并挂载到容器。
 *
 * ```ts
 * const editor = createArchiveEditor('#app', { schema, record, images });
 * editor.on('save', async ({ record }) => api.save(record));
 * ```
 */
export function createArchiveEditor(target: HTMLElement | string, options: EditorOptions = {}): ArchiveEditor {
  const el = resolveTarget(target);
  const preset =
    options.preset === undefined
      ? createBaselinePreset({
          layout: options.layout,
          metadata: { ...options.metadata, schema: options.schema, record: options.record, readonly: options.readonly },
          viewer: options.viewer === false ? false : { ...options.viewer, images: options.images },
          inspector: options.inspector,
        })
      : options.preset || null;

  const kernel = createKernel({ instanceId: options.instanceId, storage: options.storage, history: options.history });
  options.setup?.(kernel);
  // 先绑定初始监听，保证插件初始化期间派发的事件也能收到
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    if (handler) kernel.bus.on(type, handler as EventHandler<unknown>);
  }
  const ready = kernel.use([preset, options.plugins ?? null]);
  const unmount = mountWorkbench(el, kernel, { icons: options.icons, class: options.class });

  const metadata = (): MetadataService => kernel.services.get(METADATA_SERVICE);
  const layoutCommand = (region: 'left' | 'right') => (region === 'left' ? 'layout.toggleLeft' : 'layout.toggleRight');
  const run = (command: string, ...args: unknown[]) => {
    if (kernel.commands.has(command)) void kernel.execute(command, ...args);
  };

  const editor: ArchiveEditor = {
    kernel,
    ready: ready.then(() => kernel.bus.emit('ready', { instanceId: kernel.id })),
    on: (type, handler) => kernel.bus.on(type, handler),
    once: (type, handler) => kernel.bus.once(type, handler),
    off: (type, handler) => kernel.bus.off(type, handler),
    emit: (type, payload) => (kernel.bus.emit as (t: string, p: unknown) => void)(type as string, payload),
    execute: (command, ...args) => kernel.execute(command, ...args),
    use: (plugin) => kernel.use(plugin),
    unuse: (name) => kernel.unuse(name),
    getState: () => kernel.getState(),
    subscribe: (listener) => kernel.store.subscribe((state) => listener(state)),

    getRecord: () => metadata().getRecord(),
    setRecord: (record) => metadata().setRecord(record),
    getValues: () => metadata().getRecord().values,
    setValue: (key, value, label) => metadata().setValue(key, value, label),
    setValues: (values, label) => metadata().setValues(values, label),
    setSchema: (schema) => metadata().setSchema(schema),
    setImages: (images) => kernel.services.tryGet(VIEWER_SERVICE)?.setImages(images) ?? Promise.resolve(),
    setReadonly: (readonly) => metadata().setReadonly(readonly),
    validate: () => metadata().validate(),
    save: async () => ((await kernel.execute<SaveResult>('kabel.save')) ?? { ok: false }),
    undo: () => void kernel.history.undo(),
    redo: () => void kernel.history.redo(),
    isDirty: () => kernel.history.isDirty(),

    layout: {
      collapse: (region) => run(layoutCommand(region), true),
      expand: (region) => run(layoutCommand(region), false),
      toggle: (region) => run(layoutCommand(region)),
      maximize: (region) => run('layout.maximize', region),
      restore: () => run('layout.restore'),
      reset: () => run('layout.reset'),
    },

    destroy() {
      unmount();
      kernel.dispose();
    },
  };
  return editor;
}
