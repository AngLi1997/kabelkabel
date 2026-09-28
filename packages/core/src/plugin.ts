import type { CommandDefinition } from './commands';
import type { EventBus, EventHandler, EventName, EventPayload, KabelEvents } from './event-bus';
import type { History } from './history';
import type { Kernel } from './kernel';
import type { Contribution, ExtensionPoint, ExtensionRegistry } from './registry';
import type { ServiceRegistry, ServiceToken } from './services';
import type { ScopedStorage } from './storage';
import type { Action, KabelState, Slice, Store, WatchOptions } from './store';
import { DisposableStore, isPromiseLike, type Disposable } from './utils';

export type Teardown = () => void;

export interface KabelPlugin {
  /** 全局唯一名称，建议 `scope:name`，如 `kabel:viewer` */
  name: string;
  version?: string;
  /** 显示名称，用于设置中的插件管理 */
  title?: string;
  /** 内置插件（baseline 的组成部分）：不允许在运行期停用，也不在插件管理中显示 */
  builtin?: boolean;
  /** 依赖的插件名，注册时自动按依赖拓扑排序；卸载依赖时会先卸载依赖方 */
  dependencies?: string[];
  /**
   * 初始化钩子。通过 ctx 注册的一切（切片、命令、贡献项、事件、服务）在插件卸载时自动释放。
   * 可返回清理函数或 Promise（异步插件）。
   */
  setup?: (ctx: PluginContext) => void | Teardown | Promise<void | Teardown>;
}

/** 运行期按需加载：`() => import('./my-plugin')` */
export type LazyPlugin = () => Promise<KabelPlugin | { default: KabelPlugin }>;

export type PluginInput = KabelPlugin | LazyPlugin | readonly PluginInput[] | null | undefined | false;

/** 类型辅助，原样返回 */
export function definePlugin<T extends KabelPlugin>(plugin: T): T {
  return plugin;
}

export interface PluginContext {
  readonly name: string;
  readonly kernel: Kernel;
  readonly bus: EventBus<KabelEvents>;
  readonly store: Store<KabelState>;
  readonly history: History;
  readonly services: ServiceRegistry;
  readonly extensions: ExtensionRegistry;
  /** 以插件名为命名空间的持久化存储 */
  readonly storage: ScopedStorage;
  getState(): KabelState;
  dispatch(action: Action): void;
  registerSlice<S>(slice: Slice<S, any>, preloadedState?: S): void;
  registerCommand<A extends unknown[]>(command: CommandDefinition<A>): void;
  contribute<T extends Contribution>(point: ExtensionPoint<T>, ...items: T[]): void;
  provide<T>(token: ServiceToken<T>, value: T): void;
  on<K extends EventName<KabelEvents>>(type: K, handler: EventHandler<EventPayload<KabelEvents, K>>): void;
  watch<T>(selector: (state: KabelState) => T, callback: (value: T, prev: T) => void, options?: WatchOptions<T>): void;
  onDispose(fn: Teardown | Disposable): void;
}

export interface PluginRecord {
  plugin: KabelPlugin;
  disposables: DisposableStore;
}

/** 插件生命周期管理：依赖排序、同步/异步 setup、按逆序卸载 */
export class PluginManager {
  private records = new Map<string, PluginRecord>();
  private disabled = new Map<string, KabelPlugin>();

  constructor(private readonly kernel: Kernel) {}

  has(name: string): boolean {
    return this.records.has(name);
  }

  get(name: string): KabelPlugin | undefined {
    return this.records.get(name)?.plugin;
  }

  list(): KabelPlugin[] {
    return [...this.records.values()].map((r) => r.plugin);
  }

  /**
   * 注册插件。全部为同步插件时，返回前即已完成注册（首帧渲染即可见）；
   * 含懒加载或异步 setup 的插件在 Promise 完成后生效。
   */
  register(input: PluginInput): Promise<void> {
    const flat = flatten(input);
    const eager = flat.filter((p): p is KabelPlugin => typeof p !== 'function');
    const lazy = flat.filter((p): p is LazyPlugin => typeof p === 'function');
    let result: void | Promise<void>;
    try {
      result = this.activateAll(eager);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!lazy.length) return Promise.resolve(result);
    return Promise.resolve(result)
      .then(() => Promise.all(lazy.map((load) => load())))
      .then((mods) => this.activateAll(mods.map((m) => ('default' in m ? m.default : m))));
  }

  unregister(name: string): void {
    this.disabled.delete(name);
    this.remove(name, false);
  }

  /** 已停用（可重新启用）的插件 */
  listDisabled(): KabelPlugin[] {
    return [...this.disabled.values()];
  }

  isDisabled(name: string): boolean {
    return this.disabled.has(name);
  }

  /**
   * 停用插件：与卸载相同（依赖它的插件一并停用），但保留插件定义以便重新启用。
   * 返回被停用的插件名；内置插件（builtin）不可停用。
   */
  disable(name: string): string[] {
    if (this.records.get(name)?.plugin.builtin) return [];
    return this.remove(name, true);
  }

  /** 重新启用已停用的插件，其已停用的依赖会一并启用 */
  enable(name: string): Promise<void> {
    const plugins: KabelPlugin[] = [];
    const collect = (n: string) => {
      const plugin = this.disabled.get(n);
      if (!plugin || plugins.includes(plugin)) return;
      plugins.push(plugin);
      plugin.dependencies?.forEach(collect);
    };
    collect(name);
    for (const plugin of plugins) this.disabled.delete(plugin.name);
    return this.register(plugins).catch((error) => {
      // 启用失败（如依赖已被卸载）时保留在停用列表中
      for (const plugin of plugins) if (!this.records.has(plugin.name)) this.disabled.set(plugin.name, plugin);
      throw error;
    });
  }

  disposeAll(): void {
    this.disabled.clear();
    for (const name of [...this.records.keys()].reverse()) this.unregister(name);
  }

  private remove(name: string, keep: boolean, removed: string[] = []): string[] {
    const record = this.records.get(name);
    if (!record) return removed;
    for (const [other, r] of [...this.records].reverse()) {
      if (r.plugin.dependencies?.includes(name)) this.remove(other, keep, removed);
    }
    this.records.delete(name);
    if (keep) this.disabled.set(name, record.plugin);
    removed.push(name);
    record.disposables.dispose();
    this.kernel.bus.emit('plugin:unregistered', { name, disabled: keep });
    return removed;
  }

  private activateAll(plugins: KabelPlugin[]): void | Promise<void> {
    const ordered = sortByDependencies(plugins, new Set(this.records.keys()));
    const next = (index: number): void | Promise<void> => {
      for (let i = index; i < ordered.length; i += 1) {
        const pending = this.activate(ordered[i]!);
        if (pending) return pending.then(() => next(i + 1));
      }
    };
    return next(0);
  }

  private activate(plugin: KabelPlugin): void | Promise<void> {
    if (this.records.has(plugin.name)) {
      throw new Error(`[kabel] plugin "${plugin.name}" is already registered`);
    }
    for (const dep of plugin.dependencies ?? []) {
      if (!this.records.has(dep)) throw new Error(`[kabel] plugin "${plugin.name}" requires "${dep}"`);
    }
    this.disabled.delete(plugin.name);
    const disposables = new DisposableStore();
    const record: PluginRecord = { plugin, disposables };
    this.records.set(plugin.name, record);
    const ctx = createPluginContext(this.kernel, plugin.name, disposables);
    const fail = (error: unknown) => {
      this.records.delete(plugin.name);
      disposables.dispose();
      this.kernel.bus.emit('error', { error, source: `plugin:${plugin.name}` });
      if (!this.kernel.bus.listenerCount('error')) console.error(`[kabel] plugin "${plugin.name}" setup failed`, error);
    };
    const done = (teardown: void | Teardown) => {
      if (typeof teardown === 'function') disposables.add(teardown);
      this.kernel.bus.emit('plugin:registered', { name: plugin.name });
    };
    try {
      const result = plugin.setup?.(ctx);
      if (isPromiseLike<void | Teardown>(result)) return Promise.resolve(result).then(done, fail);
      done(result);
    } catch (error) {
      fail(error);
    }
  }
}

function flatten(input: PluginInput, out: (KabelPlugin | LazyPlugin)[] = []): (KabelPlugin | LazyPlugin)[] {
  if (!input) return out;
  if (Array.isArray(input)) for (const item of input) flatten(item, out);
  else out.push(input as KabelPlugin | LazyPlugin);
  return out;
}

/** 拓扑排序；缺失依赖或循环依赖会抛出错误 */
export function sortByDependencies(plugins: KabelPlugin[], existing: Set<string> = new Set()): KabelPlugin[] {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const result: KabelPlugin[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (plugin: KabelPlugin, trail: string[]) => {
    const mark = state.get(plugin.name);
    if (mark === 'done') return;
    if (mark === 'visiting') throw new Error(`[kabel] circular plugin dependency: ${[...trail, plugin.name].join(' -> ')}`);
    state.set(plugin.name, 'visiting');
    for (const dep of plugin.dependencies ?? []) {
      const target = byName.get(dep);
      if (target) visit(target, [...trail, plugin.name]);
      else if (!existing.has(dep)) throw new Error(`[kabel] plugin "${plugin.name}" requires "${dep}"`);
    }
    state.set(plugin.name, 'done');
    result.push(plugin);
  };
  for (const plugin of plugins) visit(plugin, []);
  return result;
}

function createPluginContext(kernel: Kernel, name: string, disposables: DisposableStore): PluginContext {
  const track = (d: Disposable | (() => void)) => void disposables.add(d);
  return {
    name,
    kernel,
    bus: kernel.bus,
    store: kernel.store,
    history: kernel.history,
    services: kernel.services,
    extensions: kernel.extensions,
    storage: kernel.storage.scope(name),
    getState: () => kernel.store.getState(),
    dispatch: (action) => kernel.store.dispatch(action),
    registerSlice: (slice, preloaded) => track(kernel.store.registerSlice(slice, preloaded)),
    registerCommand: (command) => track(kernel.commands.register(command)),
    contribute: (point, ...items) => items.forEach((item) => track(kernel.extensions.contribute(point, item))),
    provide: (token, value) => track(kernel.services.provide(token, value)),
    on: (type, handler) => track(kernel.bus.on(type, handler)),
    watch: (selector, callback, options) => track(kernel.store.watch(selector, callback, options)),
    onDispose: (fn) => track(fn),
  };
}
