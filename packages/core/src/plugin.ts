import type Schema from 'schemastery';
import type { CommandDefinition } from './commands';
import type { EventBus, EventHandler, EventName, EventPayload, KabelEvents } from './event-bus';
import type { History } from './history';
import type { Kernel } from './kernel';
import type { Contribution, ExtensionPoint, ExtensionRegistry } from './registry';
import type { ServiceChange, ServiceRegistry, ServiceToken } from './services';
import type { ScopedStorage } from './storage';
import type { Action, KabelState, Slice, Store, WatchOptions } from './store';
import { DisposableStore, isPromiseLike, type Disposable } from './utils';

export type Teardown = () => void;

/**
 * 服务注入声明（对应 cordis 的 `inject`）：
 * - 数组或 `required`：必需服务。全部可用前插件处于“等待”状态，不执行 setup；任一被撤回则插件停下回到等待；
 * - `optional`：可选服务。不阻塞启用，但服务出现、撤回或被覆盖时插件**重载**（先释放再 setup）。
 *
 * 必需或可选服务变化都会重载插件，因此在 `setup` 中缓存注入的服务是安全的。
 */
export type Inject =
  | readonly ServiceToken<any>[]
  | { readonly required?: readonly ServiceToken<any>[]; readonly optional?: readonly ServiceToken<any>[] };

export interface KabelPlugin<C = any> {
  /** 全局唯一名称，建议 `scope:name`，如 `kabel:workspace` */
  name: string;
  version?: string;
  /** 显示名称，用于设置中的插件管理 */
  title?: string;
  /** 内置插件（baseline 的组成部分）：不允许在运行期停用，也不在插件管理中显示 */
  builtin?: boolean;
  /**
   * 依赖的插件名：注册时按依赖拓扑排序，被依赖者未启用时本插件不启用，卸载依赖时先卸载依赖方。
   * 只用于“必须与某个插件同生共死”的场景；协作能力优先用 `inject` 声明服务依赖。
   */
  dependencies?: string[];
  /** 服务依赖（cordis `inject`），见 {@link Inject} */
  inject?: Inject;
  /**
   * 配置 Schema（cordis `Config`，schemastery）。声明后：
   * 设置 › 插件管理 中出现“配置”表单，修改后持久化并重载插件；`setup` 收到校验并补全默认值后的配置。
   */
  Config?: Schema<any, C>;
  /** 注册方给定的配置（预设或宿主的默认值）；用户在设置中保存的配置优先 */
  config?: unknown;
  /**
   * 初始化钩子。通过 ctx 注册的一切（切片、命令、贡献项、事件、服务、子插件）在插件停用、重载或卸载时自动释放。
   * 可返回清理函数或 Promise（异步插件）。
   */
  setup?: (ctx: PluginContext<C>, config: C) => void | Teardown | Promise<void | Teardown>;
}

/** 运行期按需加载：`() => import('./my-plugin')` */
export type LazyPlugin = () => Promise<KabelPlugin | { default: KabelPlugin }>;

export type PluginInput = KabelPlugin | LazyPlugin | readonly PluginInput[] | null | undefined | false;

/** 类型辅助，原样返回；声明了 `Config` 时 `setup` 的 config 类型由 Schema 推导 */
export function definePlugin<C = any>(plugin: KabelPlugin<C>): KabelPlugin<C> {
  return plugin;
}

export interface PluginContext<C = any> {
  readonly name: string;
  readonly kernel: Kernel;
  readonly bus: EventBus<KabelEvents>;
  readonly store: Store<KabelState>;
  readonly history: History;
  readonly services: ServiceRegistry;
  readonly extensions: ExtensionRegistry;
  /** 以插件名为命名空间的持久化存储 */
  readonly storage: ScopedStorage;
  /** 生效的配置（`Config` 校验并补全默认值后） */
  readonly config: C;
  getState(): KabelState;
  dispatch(action: Action): void;
  registerSlice<S>(slice: Slice<S, any>, preloadedState?: S): void;
  registerCommand<A extends unknown[]>(command: CommandDefinition<A>): void;
  contribute<T extends Contribution>(point: ExtensionPoint<T>, ...items: T[]): void;
  provide<T>(token: ServiceToken<T>, value: T): void;
  on<K extends EventName<KabelEvents>>(type: K, handler: EventHandler<EventPayload<KabelEvents, K>>): void;
  watch<T>(selector: (state: KabelState) => T, callback: (value: T, prev: T) => void, options?: WatchOptions<T>): void;
  onDispose(fn: Teardown | Disposable): void;
  /**
   * 注册子插件（cordis `ctx.plugin`）：子插件的生命周期挂在当前上下文上，
   * 本插件停用、重载、卸载（或所在作用域释放）时子插件随之卸载。`config` 作为子插件的注册方配置。
   */
  plugin(input: PluginInput, config?: unknown): Promise<void>;
  /**
   * 创建子作用域（cordis 的 fork）：在作用域上注册的一切可以单独释放，插件卸载时也会释放。
   * 典型用法：随当前档案注册、切换档案时 `scope.dispose()` 后重建。
   */
  scope(): PluginScope<C>;
}

export interface PluginScope<C = any> extends PluginContext<C>, Disposable {}

export type PluginStatus = 'pending' | 'active';

interface PluginRecord {
  plugin: KabelPlugin;
  /** 通过 `ctx.plugin` 注册时的父插件 */
  parent?: string;
  status: PluginStatus;
  /** 当前一次 setup 的注册集合；等待中为 null */
  runtime: DisposableStore | null;
  config: unknown;
  /** 注入的服务发生变化，需要重载 */
  stale: boolean;
}

interface DisabledEntry {
  plugin: KabelPlugin;
  parent?: string;
}

const CONFIG_KEY = 'config';

function injectList(inject: Inject | undefined, kind: 'required' | 'optional'): readonly ServiceToken<any>[] {
  if (!inject) return [];
  if (Array.isArray(inject)) return kind === 'required' ? inject : [];
  return (inject as Exclude<Inject, readonly ServiceToken<any>[]>)[kind] ?? [];
}

/** 插件声明注入的全部服务 id */
export function injectedServices(plugin: KabelPlugin): { required: string[]; optional: string[] } {
  return {
    required: injectList(plugin.inject, 'required').map((t) => t.id),
    optional: injectList(plugin.inject, 'optional').map((t) => t.id),
  };
}

/**
 * 插件生命周期管理（对照 cordis 的 Registry / Fork）：
 *
 * - 注册：按 `dependencies` 拓扑排序；全部为同步插件且依赖就绪时，返回前即已完成 setup（首帧可见）；
 * - 等待：`inject` 的必需服务或被依赖插件未就绪时处于 `pending`，就绪后自动 setup；
 * - 重载：注入的服务变化、配置变化时先释放再 setup；
 * - 子插件：`ctx.plugin()` 注册的插件随父插件 / 作用域释放；
 * - 停用：与卸载相同（依赖方一并停用），但保留定义以便重新启用。
 */
export class PluginManager {
  private records = new Map<string, PluginRecord>();
  private disabled = new Map<string, DisabledEntry>();
  private flushing = false;
  private dirty = false;
  private running: Promise<void> | null = null;

  constructor(private readonly kernel: Kernel) {}

  /** 已注册（启用中或等待中） */
  has(name: string): boolean {
    return this.records.has(name);
  }

  get(name: string): KabelPlugin | undefined {
    return this.records.get(name)?.plugin;
  }

  list(): KabelPlugin[] {
    return [...this.records.values()].map((r) => r.plugin);
  }

  /** `active` 已启用；`pending` 等待依赖或服务；`disabled` 已停用；未注册为 undefined */
  status(name: string): PluginStatus | 'disabled' | undefined {
    if (this.disabled.has(name)) return 'disabled';
    return this.records.get(name)?.status;
  }

  isActive(name: string): boolean {
    return this.records.get(name)?.status === 'active';
  }

  /** 插件尚未就绪的原因：未启用的依赖插件名、缺失的必需服务 id */
  blockers(name: string): string[] {
    const record = this.records.get(name);
    return record ? this.blockersOf(record.plugin) : [];
  }

  /** 父插件名（通过 `ctx.plugin` 注册的子插件） */
  parentOf(name: string): string | undefined {
    return this.records.get(name)?.parent ?? this.disabled.get(name)?.parent;
  }

  /**
   * 注册插件。全部为同步插件时，返回前即已完成注册（首帧渲染即可见）；
   * 含懒加载或异步 setup 的插件在 Promise 完成后生效；等待服务的插件在服务就绪后生效。
   */
  register(input: PluginInput, parent?: string): Promise<void> {
    const flat = flatten(input);
    const eager = flat.filter((p): p is KabelPlugin => typeof p !== 'function');
    const lazy = flat.filter((p): p is LazyPlugin => typeof p === 'function');
    let result: void | Promise<void>;
    try {
      result = this.addAll(eager, parent);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!lazy.length) return Promise.resolve(result);
    return Promise.resolve(result)
      .then(() => Promise.all(lazy.map((load) => load())))
      .then((mods) => {
        // 父插件在加载期间已被释放
        if (parent && !this.isActive(parent)) return;
        return this.addAll(
          mods.map((m) => ('default' in m ? m.default : m)),
          parent,
        );
      });
  }

  unregister(name: string): void {
    this.disabled.delete(name);
    this.remove(name, false);
    void this.flush();
  }

  /** 已停用（可重新启用）的插件 */
  listDisabled(): KabelPlugin[] {
    return [...this.disabled.values()].map((e) => e.plugin);
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
    const removed = this.remove(name, true);
    void this.flush();
    return removed;
  }

  /** 重新启用已停用的插件，其已停用的依赖会一并启用 */
  enable(name: string): Promise<void> {
    const entries: DisabledEntry[] = [];
    const collect = (n: string) => {
      const entry = this.disabled.get(n);
      if (!entry || entries.includes(entry)) return;
      entries.push(entry);
      entry.plugin.dependencies?.forEach(collect);
    };
    collect(name);
    for (const entry of entries) this.disabled.delete(entry.plugin.name);
    return this.register(
      entries.map((e) => e.plugin),
      entries[0]?.parent,
    ).catch((error) => {
      // 启用失败（如依赖已被卸载）时保留在停用列表中
      for (const entry of entries) if (!this.records.has(entry.plugin.name)) this.disabled.set(entry.plugin.name, entry);
      throw error;
    });
  }

  // ---------- 配置 ----------

  /** 生效的配置：启用中的插件返回本次 setup 使用的配置，否则按存储与默认值计算 */
  getConfig<C = unknown>(name: string): C | undefined {
    const record = this.records.get(name);
    if (record?.status === 'active') return record.config as C;
    const plugin = record?.plugin ?? this.disabled.get(name)?.plugin;
    if (!plugin) return undefined;
    try {
      return this.resolveConfig(plugin) as C;
    } catch {
      return undefined;
    }
  }

  /** 用户是否保存过配置（否则为注册方给定的配置） */
  hasStoredConfig(name: string): boolean {
    return name in this.storedConfig();
  }

  /**
   * 保存配置：按 `Config` 校验（失败抛出 ValidationError，不保存），持久化后重载插件。
   */
  updateConfig(name: string, value: unknown): Promise<void> {
    const plugin = this.records.get(name)?.plugin ?? this.disabled.get(name)?.plugin;
    if (!plugin) return Promise.reject(new Error(`[kabel] plugin "${name}" is not registered`));
    let resolved: unknown;
    try {
      resolved = plugin.Config ? plugin.Config(value) : value;
    } catch (error) {
      return Promise.reject(error);
    }
    this.writeConfig(name, resolved);
    this.kernel.bus.emit('plugin:config', { name, config: resolved });
    return this.reload(name);
  }

  /** 清除用户配置，恢复注册方给定的配置并重载 */
  resetConfig(name: string): Promise<void> {
    this.writeConfig(name, undefined);
    this.kernel.bus.emit('plugin:config', { name, config: this.getConfig(name) });
    return this.reload(name);
  }

  /** 重载插件（先释放再 setup） */
  reload(name: string): Promise<void> {
    const record = this.records.get(name);
    if (record?.status === 'active') record.stale = true;
    return Promise.resolve(this.flush());
  }

  /** 服务变化：注入了该服务的插件重载（提供者自身除外），必需服务缺失的插件停下等待 */
  onServiceChange(change: ServiceChange): void {
    for (const record of this.records.values()) {
      if (record.status !== 'active' || record.plugin.name === change.owner) continue;
      const { required, optional } = injectedServices(record.plugin);
      if (required.includes(change.id) || optional.includes(change.id)) record.stale = true;
    }
    void this.flush();
  }

  disposeAll(): void {
    this.disabled.clear();
    for (const name of [...this.records.keys()].reverse()) this.unregister(name);
  }

  // ---------- 内部 ----------

  private addAll(plugins: KabelPlugin[], parent?: string): void | Promise<void> {
    const ordered = sortByDependencies(plugins, new Set(this.records.keys()));
    const added: KabelPlugin[] = [];
    for (const plugin of ordered) {
      const existing = this.records.get(plugin.name);
      // 父插件重载时重复注册同一子插件（例如用户单独启用过它）：保持原记录
      if (existing && parent && existing.parent === parent) continue;
      if (existing || added.some((p) => p.name === plugin.name)) {
        throw new Error(`[kabel] plugin "${plugin.name}" is already registered`);
      }
      added.push(plugin);
    }
    for (const plugin of added) {
      // 用户停用过的子插件：父插件重载后仍保持停用
      if (parent && this.disabled.has(plugin.name)) {
        this.disabled.set(plugin.name, { plugin, parent });
        continue;
      }
      this.disabled.delete(plugin.name);
      this.records.set(plugin.name, { plugin, parent, status: 'pending', runtime: null, config: undefined, stale: false });
    }
    return this.flush();
  }

  private blockersOf(plugin: KabelPlugin): string[] {
    const out: string[] = [];
    for (const dep of plugin.dependencies ?? []) if (this.records.get(dep)?.status !== 'active') out.push(dep);
    for (const id of injectedServices(plugin).required) if (!this.kernel.services.hasId(id)) out.push(id);
    return out;
  }

  /**
   * 推进所有插件到稳定状态：停下未就绪或需要重载的插件，启用已就绪的插件，直到不再变化。
   * 重入（setup 中提供服务、注册子插件）时只标记，由外层循环继续；遇到异步 setup 时在其完成后继续。
   */
  private flush(): void | Promise<void> {
    if (this.flushing || this.running) {
      this.dirty = true;
      return this.running ?? undefined;
    }
    this.flushing = true;
    try {
      do {
        this.dirty = false;
        for (const record of [...this.records.values()].reverse()) {
          if (record.status === 'active' && (record.stale || this.blockersOf(record.plugin).length)) this.deactivate(record);
        }
        for (const record of [...this.records.values()]) {
          if (record.status !== 'pending' || this.records.get(record.plugin.name) !== record) continue;
          if (this.blockersOf(record.plugin).length) continue;
          const pending = this.activate(record);
          if (pending) {
            this.running = pending.then(() => {
              this.running = null;
              return this.flush();
            });
            return this.running;
          }
        }
      } while (this.dirty);
    } finally {
      this.flushing = false;
    }
  }

  private activate(record: PluginRecord): void | Promise<void> {
    const { plugin } = record;
    let config: unknown;
    try {
      config = this.resolveConfig(plugin);
    } catch (error) {
      this.fail(record, error);
      return;
    }
    const runtime = new DisposableStore();
    record.runtime = runtime;
    record.status = 'active';
    record.config = config;
    record.stale = false;
    const ctx = createPluginContext(this.kernel, this, plugin.name, runtime, config);
    const done = (teardown: void | Teardown) => {
      if (typeof teardown === 'function') runtime.add(teardown);
      if (record.runtime !== runtime) return;
      this.kernel.bus.emit('plugin:registered', { name: plugin.name });
      this.kernel.bus.emit('plugin:status', { name: plugin.name, status: 'active' });
    };
    try {
      const result = plugin.setup?.(ctx, config);
      if (isPromiseLike<void | Teardown>(result)) return Promise.resolve(result).then(done, (error) => this.fail(record, error));
      done(result);
    } catch (error) {
      this.fail(record, error);
    }
  }

  /** setup 失败：移除该插件（及依赖它的插件），派发 error，不影响其他插件 */
  private fail(record: PluginRecord, error: unknown) {
    const { name } = record.plugin;
    if (this.records.get(name) === record) this.remove(name, false, [], true);
    this.kernel.bus.emit('error', { error, source: `plugin:${name}` });
    if (!this.kernel.bus.listenerCount('error')) console.error(`[kabel] plugin "${name}" setup failed`, error);
  }

  /** 停下（回到等待）：依赖方先停，子插件随之卸载 */
  private deactivate(record: PluginRecord) {
    if (record.status !== 'active') return;
    const { name } = record.plugin;
    for (const other of [...this.records.values()].reverse()) {
      if (other.status === 'active' && other.plugin.dependencies?.includes(name)) this.deactivate(other);
    }
    record.status = 'pending';
    const runtime = record.runtime;
    record.runtime = null;
    this.removeChildren(name);
    runtime?.dispose();
    this.kernel.bus.emit('plugin:status', { name, status: 'pending' });
  }

  private removeChildren(parent: string) {
    for (const [name, r] of [...this.records].reverse()) if (r.parent === parent) this.remove(name, false);
  }

  private remove(name: string, keep: boolean, removed: string[] = [], silent = false): string[] {
    const record = this.records.get(name);
    if (!record) return removed;
    for (const [other, r] of [...this.records].reverse()) {
      if (r.plugin.dependencies?.includes(name)) this.remove(other, keep, removed);
    }
    this.records.delete(name);
    if (keep) this.disabled.set(name, { plugin: record.plugin, parent: record.parent });
    else for (const [child, entry] of [...this.disabled]) if (entry.parent === name) this.disabled.delete(child);
    removed.push(name);
    const runtime = record.runtime;
    record.runtime = null;
    record.status = 'pending';
    this.removeChildren(name);
    runtime?.dispose();
    if (!silent) this.kernel.bus.emit('plugin:unregistered', { name, disabled: keep });
    return removed;
  }

  private storedConfig(): Record<string, unknown> {
    return this.kernel.storage.scope('kabel:plugins').get<Record<string, unknown>>(CONFIG_KEY, {});
  }

  private writeConfig(name: string, value: unknown) {
    const all = { ...this.storedConfig() };
    if (value === undefined) delete all[name];
    else all[name] = value;
    this.kernel.storage.scope('kabel:plugins').set(CONFIG_KEY, all);
  }

  private resolveConfig(plugin: KabelPlugin): unknown {
    const stored = this.storedConfig()[plugin.name];
    if (!plugin.Config) return stored !== undefined ? stored : plugin.config;
    if (stored !== undefined) {
      try {
        return plugin.Config(stored);
      } catch (error) {
        // 存储的配置已不符合新版 Schema：回退到注册方配置
        console.warn(`[kabel] stored config of "${plugin.name}" is invalid, falling back`, error);
      }
    }
    return plugin.Config(plugin.config as never);
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

function createPluginContext<C>(kernel: Kernel, manager: PluginManager, name: string, disposables: DisposableStore, config: C): PluginContext<C> {
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
    config,
    getState: () => kernel.store.getState(),
    dispatch: (action) => kernel.store.dispatch(action),
    registerSlice: (slice, preloaded) => track(kernel.store.registerSlice(slice, preloaded)),
    registerCommand: (command) => track(kernel.commands.register(command)),
    contribute: (point, ...items) => items.forEach((item) => track(kernel.extensions.contribute(point, item))),
    provide: (token, value) => track(kernel.services.provide(token, value, name)),
    on: (type, handler) => track(kernel.bus.on(type, handler)),
    watch: (selector, callback, options) => track(kernel.store.watch(selector, callback, options)),
    onDispose: (fn) => track(fn),
    plugin(input, childConfig) {
      const target =
        childConfig !== undefined && input && typeof input === 'object' && !Array.isArray(input)
          ? { ...(input as KabelPlugin), config: childConfig }
          : input;
      const names = flatten(target)
        .filter((p): p is KabelPlugin => typeof p !== 'function')
        .map((p) => p.name);
      track(() => {
        for (const child of names) if (manager.parentOf(child) === name && manager.has(child)) manager.unregister(child);
      });
      return manager.register(target, name);
    },
    scope() {
      const child = new DisposableStore();
      const entry = disposables.add(child);
      const scoped = createPluginContext(kernel, manager, name, child, config) as PluginScope<C>;
      scoped.dispose = () => {
        disposables.delete(entry);
        child.dispose();
      };
      return scoped;
    },
  };
}
