import { toDisposable, type Disposable, type Unsubscribe } from './utils';

/** 服务令牌：插件之间通过令牌共享能力，避免直接 import 实现 */
export interface ServiceToken<T> {
  readonly id: string;
  readonly __service?: T;
}

export function createServiceToken<T>(id: string): ServiceToken<T> {
  return Object.freeze({ id }) as ServiceToken<T>;
}

/** 服务变化：`owner` 为提供 / 撤回该服务的插件名（宿主直接提供时为空） */
export interface ServiceChange {
  id: string;
  owner?: string;
}

interface Entry {
  value: unknown;
  owner?: string;
}

/**
 * 服务注册表（覆盖栈）：同一令牌后提供者生效，撤回后恢复前者。
 * 栈顶变化时通知订阅者——插件管理器据此让声明了 `inject` 的插件等待、启用或重载。
 */
export class ServiceRegistry {
  private services = new Map<string, Entry[]>();
  private listeners = new Set<(change: ServiceChange) => void>();

  provide<T>(token: ServiceToken<T>, value: T, owner?: string): Disposable {
    const stack = this.services.get(token.id) ?? [];
    const entry: Entry = { value, owner };
    stack.push(entry);
    this.services.set(token.id, stack);
    this.changed({ id: token.id, owner });
    return toDisposable(() => {
      const index = stack.lastIndexOf(entry);
      if (index < 0) return;
      const top = index === stack.length - 1;
      stack.splice(index, 1);
      if (!stack.length) this.services.delete(token.id);
      if (top) this.changed({ id: token.id, owner });
    });
  }

  has(token: ServiceToken<unknown>): boolean {
    return !!this.services.get(token.id)?.length;
  }

  /** 按 id 判断（插件管理器使用） */
  hasId(id: string): boolean {
    return !!this.services.get(id)?.length;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    const stack = this.services.get(token.id);
    return stack?.[stack.length - 1]?.value as T | undefined;
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.has(token)) throw new Error(`[kabel] service "${token.id}" is not provided`);
    return this.tryGet(token) as T;
  }

  /** 订阅栈顶变化（提供、撤回、覆盖） */
  onChange(listener: (change: ServiceChange) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(change: ServiceChange) {
    for (const listener of [...this.listeners]) listener(change);
  }
}
