import type { Kernel } from './kernel';
import { toDisposable, type Disposable, type Unsubscribe } from './utils';

export interface CommandDefinition<A extends unknown[] = any[]> {
  /** 全局唯一，建议 `命名空间.动作`，如 `viewer.zoomIn` */
  id: string;
  title?: string;
  icon?: string;
  /** 例如 `Mod+S`、`Mod+Shift+Z` */
  keybinding?: string | string[];
  /** 是否可执行，基于状态计算；UI 会在状态变化时重新求值 */
  enabled?: (kernel: Kernel) => boolean;
  /** 是否处于选中/激活状态（切换类按钮） */
  checked?: (kernel: Kernel) => boolean;
  run: (kernel: Kernel, ...args: A) => unknown;
}

/**
 * 命令注册表。同 id 重复注册时，后注册者生效，释放后恢复前者——宿主可借此覆盖内置命令。
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition[]>();
  private listeners = new Set<() => void>();

  constructor(private readonly kernel: Kernel) {}

  register<A extends unknown[]>(definition: CommandDefinition<A>): Disposable {
    const def = definition as unknown as CommandDefinition;
    const stack = this.commands.get(def.id) ?? [];
    stack.push(def);
    this.commands.set(def.id, stack);
    this.changed();
    return toDisposable(() => {
      const index = stack.indexOf(def);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) this.commands.delete(def.id);
      this.changed();
    });
  }

  get(id: string): CommandDefinition | undefined {
    const stack = this.commands.get(id);
    return stack?.[stack.length - 1];
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  list(): CommandDefinition[] {
    return [...this.commands.keys()].map((id) => this.get(id)!);
  }

  isEnabled(id: string): boolean {
    const def = this.get(id);
    if (!def) return false;
    try {
      return def.enabled ? def.enabled(this.kernel) : true;
    } catch {
      return false;
    }
  }

  isChecked(id: string): boolean {
    const def = this.get(id);
    try {
      return !!def?.checked?.(this.kernel);
    } catch {
      return false;
    }
  }

  async execute<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
    const def = this.get(id);
    if (!def) throw new Error(`[kabel] command "${id}" not found`);
    if (!this.isEnabled(id)) return undefined;
    const { bus } = this.kernel;
    bus.emit('command:before', { id, args });
    const result = await def.run(this.kernel, ...args);
    bus.emit('command:after', { id, args, result });
    return result as T;
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const listener of [...this.listeners]) listener();
  }
}
