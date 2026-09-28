import { CommandRegistry } from './commands';
import { EventBus, type KabelEvents } from './event-bus';
import { History, type HistoryOptions } from './history';
import { PluginManager, type PluginInput } from './plugin';
import { ExtensionRegistry } from './registry';
import { ServiceRegistry } from './services';
import { ScopedStorage, resolveStorage, type StorageInput } from './storage';
import { Store, type Action, type KabelState } from './store';

export interface KernelOptions {
  /** 实例标识，用于持久化命名空间（同一页面多个实例时需区分） */
  instanceId?: string;
  /** 持久化存储，默认 localStorage，`false` 关闭持久化 */
  storage?: StorageInput;
  history?: HistoryOptions;
  /** 编译期注册的插件 */
  plugins?: PluginInput;
}

/**
 * 微内核：只提供事件、状态、历史、命令、服务、扩展点与插件管理，
 * 一切业务能力（包括撤销按钮、布局、编辑器）均由插件提供。
 */
export class Kernel {
  readonly id: string;
  readonly bus = new EventBus<KabelEvents>();
  readonly store = new Store<KabelState>();
  readonly history: History;
  readonly commands: CommandRegistry;
  readonly services = new ServiceRegistry();
  readonly extensions = new ExtensionRegistry();
  readonly plugins: PluginManager;
  readonly storage: ScopedStorage;
  /** 编译期插件全部就绪（含异步插件）后 resolve */
  readonly ready: Promise<void>;
  private disposed = false;

  constructor(options: KernelOptions = {}) {
    this.id = options.instanceId ?? 'default';
    this.storage = new ScopedStorage(resolveStorage(options.storage), `kabel:${this.id}`);
    this.history = new History(this.store, options.history);
    this.commands = new CommandRegistry(this);
    this.plugins = new PluginManager(this);
    this.ready = this.plugins.register(options.plugins);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  getState(): KabelState {
    return this.store.getState();
  }

  dispatch(action: Action): void {
    this.store.dispatch(action);
  }

  /** 运行期注册插件 */
  use(input: PluginInput): Promise<void> {
    return this.plugins.register(input);
  }

  /** 运行期卸载插件（依赖它的插件会一并卸载） */
  unuse(name: string): void {
    this.plugins.unregister(name);
  }

  execute<T = unknown>(command: string, ...args: unknown[]): Promise<T | undefined> {
    return this.commands.execute<T>(command, ...args);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.plugins.disposeAll();
    this.history.dispose();
    this.bus.clear();
  }
}

export function createKernel(options?: KernelOptions): Kernel {
  return new Kernel(options);
}
