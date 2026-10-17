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
  /** 插件进入启用（active）或等待（pending：依赖或必需服务未就绪、重载中） */
  'plugin:status': { name: string; status: 'active' | 'pending' };
  /** 插件配置已保存（随后插件重载） */
  'plugin:config': { name: string; config: unknown };
  /** 服务栈顶变化（提供、撤回、覆盖） */
  'service:change': { id: string; owner?: string };
  'command:before': { id: string; args: unknown[] };
  'command:after': { id: string; args: unknown[]; result: unknown };
  /** 命令执行失败（异常仍会抛给调用方） */
  'command:error': { id: string; args: unknown[]; error: unknown };
  /** 保存流程：处理器可返回 Promise，全部完成后才标记为已保存；reject 表示保存失败 */
  save: SavePayload;
  saved: SavePayload;
  'save:error': { error: unknown };
  /** 底座弹窗已打开 / 已关闭（`DIALOG_SERVICE`） */
  'dialog:open': { id: string; props?: unknown };
  'dialog:close': { id: string };
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
/** 派发附带的元信息：`source` 为派发事件的插件名（经 `ctx.bus` 派发时自动填入） */
export interface EmitMeta {
  source?: string;
}
export type AnyEventHandler = (type: string, payload: unknown, meta: EmitMeta) => void;

/**
 * 同步 + 异步事件总线。
 * - `emit`：同步派发，单个处理器异常不会中断其他处理器，异常转发到 `error` 事件。
 * - `emitAsync`：按注册顺序依次等待处理器，任一处理器 reject 则整体 reject（用于保存等可否决流程）。
 * - `withSource(name)`：返回同一总线的视图，经它派发的事件带上来源（插件上下文的 `ctx.bus` 即是如此），
 *   `onAny` 监听者可据此知道是哪个插件触发了事件（日志看板即依赖这一点）。
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
    this.fire(type as string, args[0], {});
  }

  async emitAsync<K extends EventName<E>>(
    type: K,
    ...args: OptionalPayload<EventPayload<E, K>>
  ): Promise<unknown[]> {
    return this.fireAsync(type as string, args[0], {});
  }

  /** 以指定来源派发（同步） */
  emitAs(source: string | undefined, type: EventName<E>, payload?: unknown): void {
    this.fire(type as string, payload, source ? { source } : {});
  }

  /**
   * 带来源的总线视图：`on` / `off` 等与原总线共享，`emit` / `emitAsync` 自动附带来源。
   */
  withSource(source: string): EventBus<E> {
    const view = Object.create(this) as EventBus<E>;
    const meta: EmitMeta = { source };
    view.emit = ((type: string, payload?: unknown) => this.fire(type, payload, meta)) as EventBus<E>['emit'];
    view.emitAsync = ((type: string, payload?: unknown) => this.fireAsync(type, payload, meta)) as EventBus<E>['emitAsync'];
    view.emitAs = (src, type, payload) => this.emitAs(src ?? source, type, payload);
    return view;
  }

  private fire(key: string, payload: unknown, meta: EmitMeta): void {
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
    this.notifyAny(key, payload, meta);
  }

  private async fireAsync(key: string, payload: unknown, meta: EmitMeta): Promise<unknown[]> {
    const results: unknown[] = [];
    const set = this.handlers.get(key);
    if (set) {
      for (const handler of [...set]) results.push(await handler(payload));
    }
    this.notifyAny(key, payload, meta);
    return results;
  }

  private notifyAny(key: string, payload: unknown, meta: EmitMeta) {
    for (const handler of [...this.anyHandlers]) {
      try {
        handler(key, payload, meta);
      } catch (error) {
        this.reportError(key, error);
      }
    }
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
