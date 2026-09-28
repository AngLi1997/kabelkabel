import { toDisposable, type Disposable } from './utils';

/** 服务令牌：插件之间通过令牌共享能力，避免直接 import 实现 */
export interface ServiceToken<T> {
  readonly id: string;
  readonly __service?: T;
}

export function createServiceToken<T>(id: string): ServiceToken<T> {
  return Object.freeze({ id }) as ServiceToken<T>;
}

export class ServiceRegistry {
  private services = new Map<string, unknown[]>();

  provide<T>(token: ServiceToken<T>, value: T): Disposable {
    const stack = this.services.get(token.id) ?? [];
    stack.push(value);
    this.services.set(token.id, stack);
    return toDisposable(() => {
      const index = stack.lastIndexOf(value);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) this.services.delete(token.id);
    });
  }

  has(token: ServiceToken<unknown>): boolean {
    return !!this.services.get(token.id)?.length;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    const stack = this.services.get(token.id);
    return stack?.[stack.length - 1] as T | undefined;
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.has(token)) throw new Error(`[kabel] service "${token.id}" is not provided`);
    return this.tryGet(token) as T;
  }
}
