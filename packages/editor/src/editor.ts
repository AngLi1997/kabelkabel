import {
  createKernel,
  type EventHandler,
  type EventName,
  type EventPayload,
  type HistoryOptions,
  type KabelEvents,
  type ConfirmOptions,
  type KabelState,
  type Kernel,
  type NotifyOptions,
  NOTIFY_SERVICE,
  isReadonly,
  type PluginInput,
  type RegionId,
  type SaveResult,
  type StorageInput,
  type Unsubscribe,
} from '@kabel/core';
import { WORKSPACE_SERVICE, type DocumentItem, type ImageItem, type ImageSourceInput, type WorkspacePluginOptions } from '@kabel/plugin-workspace';
import {
  mountWorkbench,
  type IconConfig,
  type LayoutOptions,
  type ThemeOptions,
} from '@kabel/ui';
import { createBaselinePreset, type BaselineOptions } from './preset';

export type EventListeners = { [K in keyof KabelEvents]?: EventHandler<KabelEvents[K]> };

export interface EditorOptions {
  /** 当前打开的文件（影像）：URL、base64、Blob、ArrayBuffer、对象或异步加载器；显示在文件目录与内容区域 */
  images?: readonly ImageSourceInput[];
  /** 追加的插件（编译期注册） */
  plugins?: PluginInput;
  /** 替换默认 baseline 预设；`false` 表示不使用任何预设 */
  preset?: PluginInput | false;
  layout?: LayoutOptions;
  /** 初始只读：声明了 `mutates` 的命令（保存、撤销、重做…）被禁用 */
  readonly?: boolean;
  /** 保存契约：`{ confirmLeave? }`；`false` 关闭 */
  save?: BaselineOptions['save'];
  /** 工作台：`{ items?, thumbnails?, directory?, content?, urlFactory? }`；`false` 不注册 */
  workspace?: Omit<WorkspacePluginOptions, 'images'> | false;
  /** `false` 关闭工具栏右侧的设置入口 */
  settings?: false;
  theme?: ThemeOptions | false;
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

  /** 打开一组影像；包含异步加载器时，Promise 在全部加载后完成 */
  setImages(images: readonly ImageSourceInput[]): Promise<void>;
  /** 当前打开的全部影像 */
  getImages(): ImageItem[];
  /** 直接设置已解析的文件列表（用于非图片类型，需有对应渲染器） */
  setDocuments(items: DocumentItem[]): void;
  getDocuments(): DocumentItem[];
  getCurrentDocument(): DocumentItem | undefined;
  goto(index: number): void;
  /** 保存：依次等待 `save` 事件处理器，成功后标记为已保存 */
  save(): Promise<SaveResult>;
  setReadonly(readonly: boolean): void;
  isReadonly(): boolean;
  /** 显示一条提示 */
  notify(message: string, options?: NotifyOptions): void;
  /** 弹出确认框 */
  confirm(options: ConfirmOptions | string): Promise<boolean>;
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
 * 创建档案工具并挂载到容器。
 *
 * ```ts
 * const editor = createArchiveEditor('#app', { images });
 * editor.use(myPlugin());   // 向左侧 / 右侧面板、工具栏、状态栏贡献内容
 * ```
 */
export function createArchiveEditor(target: HTMLElement | string, options: EditorOptions = {}): ArchiveEditor {
  const el = resolveTarget(target);
  const preset =
    options.preset === undefined
      ? createBaselinePreset({
          layout: options.layout,
          readonly: options.readonly,
          save: options.save,
          workspace: options.workspace === false ? false : { ...options.workspace, images: options.images },
          settings: options.settings,
          theme: options.theme,
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

    setImages: (images) => kernel.services.tryGet(WORKSPACE_SERVICE)?.setImages(images) ?? Promise.resolve(),
    getImages: () => kernel.services.tryGet(WORKSPACE_SERVICE)?.getImages() ?? [],
    setDocuments: (items) => kernel.services.tryGet(WORKSPACE_SERVICE)?.setDocuments(items),
    getDocuments: () => kernel.services.tryGet(WORKSPACE_SERVICE)?.getDocuments() ?? [],
    getCurrentDocument: () => kernel.services.tryGet(WORKSPACE_SERVICE)?.current(),
    goto: (index) => kernel.services.tryGet(WORKSPACE_SERVICE)?.goto(index),
    save: async () => ((await kernel.execute<SaveResult>('kabel.save')) ?? { ok: false }),
    setReadonly: (readonly) => void kernel.execute('kabel.setReadonly', readonly),
    isReadonly: () => isReadonly(kernel.getState()),
    notify: (message, options) => void kernel.services.tryGet(NOTIFY_SERVICE)?.notify(message, options),
    confirm: (opts) => kernel.services.tryGet(NOTIFY_SERVICE)?.confirm(opts) ?? Promise.resolve(false),
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
