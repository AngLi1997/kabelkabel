import type { Unsubscribe } from './utils';

/**
 * 内置事件表。插件与宿主可通过模块扩充追加事件类型：
 *
 * ```ts
 * declare module '@kabel/core' {
 *   interface KabelEvents { 'archive:submit': { id: string } }
 * }
 * ```
 */
export interface KabelEvents {
  ready: { instanceId: string };
  error: { error: unknown; source?: string };
  'plugin:registered': { name: string };
  /** disabled 为 true 表示被停用（可重新启用），否则为卸载 */
  'plugin:unregistered': { name: string; disabled?: boolean };
  'command:before': { id: string; args: unknown[] };
  'command:after': { id: string; args: unknown[]; result: unknown };
  /** 保存流程：处理器可返回 Promise，全部完成后才标记为已保存；reject 表示保存失败 */
  save: SavePayload;
  saved: SavePayload;
  'save:error': { error: unknown };
  /** 只读模式切换 */
  'mode:change': { readonly: boolean };
}

export interface SavePayload {
  /** 触发来源，默认 `manual` */
  reason?: string;
}

export type EventName<E> = keyof E | (string & {});
export type EventPayload<E, K> = K extends keyof E ? E[K] : unknown;
export type EventHandler<P> = (payload: P) => unknown;
export type AnyEventHandler = (type: string, payload: unknown) => void;

/**
 * 同步 + 异步事件总线。
 * - `emit`：同步派发，单个处理器异常不会中断其他处理器，异常转发到 `error` 事件。
 * - `emitAsync`：按注册顺序依次等待处理器，任一处理器 reject 则整体 reject（用于保存等可否决流程）。
 */
export class EventBus<E extends object = KabelEvents> {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private anyHandlers = new Set<AnyEventHandler>();

  on<K extends EventName<E>>(type: K, handler: EventHandler<EventPayload<E, K>>): Unsubscribe {
    const key = type as string;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  once<K extends EventName<E>>(type: K, handler: EventHandler<EventPayload<E, K>>): Unsubscribe {
    const off = this.on(type, (payload) => {
      off();
      return handler(payload);
    });
    return off;
  }

  off<K extends EventName<E>>(type: K, handler?: EventHandler<EventPayload<E, K>>): void {
    const key = type as string;
    if (!handler) {
      this.handlers.delete(key);
      return;
    }
    const set = this.handlers.get(key);
    set?.delete(handler);
    if (set && set.size === 0) this.handlers.delete(key);
  }

  /** 监听全部事件，常用于调试或与宿主桥接。 */
  onAny(handler: AnyEventHandler): Unsubscribe {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends EventName<E>>(type: K, ...args: OptionalPayload<EventPayload<E, K>>): void {
    const key = type as string;
    const payload = args[0];
    const set = this.handlers.get(key);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (error) {
          this.reportError(key, error);
        }
      }
    }
    for (const handler of [...this.anyHandlers]) {
      try {
        handler(key, payload);
      } catch (error) {
        this.reportError(key, error);
      }
    }
  }

  async emitAsync<K extends EventName<E>>(
    type: K,
    ...args: OptionalPayload<EventPayload<E, K>>
  ): Promise<unknown[]> {
    const key = type as string;
    const payload = args[0];
    const results: unknown[] = [];
    const set = this.handlers.get(key);
    if (set) {
      for (const handler of [...set]) results.push(await handler(payload));
    }
    for (const handler of [...this.anyHandlers]) handler(key, payload);
    return results;
  }

  listenerCount(type: EventName<E>): number {
    return this.handlers.get(type as string)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }

  private reportError(source: string, error: unknown) {
    if (source === 'error' || !this.handlers.get('error')?.size) {
      console.error(`[kabel] event handler "${source}" failed`, error);
      return;
    }
    (this.emit as (type: string, payload: unknown) => void)('error', { error, source });
  }
}

type OptionalPayload<P> = unknown extends P ? [payload?: P] : [P] extends [undefined | void] ? [payload?: P] : [payload: P];
