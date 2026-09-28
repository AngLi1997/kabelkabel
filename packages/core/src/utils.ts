/** 可释放资源。所有注册类 API 均返回 Disposable，便于插件卸载时统一回收。 */
export interface Disposable {
  dispose(): void;
}

export type Unsubscribe = () => void;

export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      fn();
    },
  };
}

/** 收集多个 Disposable，按注册的逆序释放。 */
export class DisposableStore implements Disposable {
  private items: Disposable[] = [];
  private disposed = false;

  get isDisposed(): boolean {
    return this.disposed;
  }

  add(item: Disposable | (() => void)): Disposable {
    const d = typeof item === 'function' ? toDisposable(item) : item;
    if (this.disposed) d.dispose();
    else this.items.push(d);
    return d;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const items = this.items.reverse();
    this.items = [];
    for (const item of items) {
      try {
        item.dispose();
      } catch (err) {
        console.error('[kabel] dispose failed', err);
      }
    }
  }
}

export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof (value as PromiseLike<T>).then === 'function';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = () => {
    timer = undefined;
    if (!pending) return;
    const args = pending;
    pending = undefined;
    fn(...args);
  };
  const debounced = ((...args: A) => {
    pending = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  debounced.flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    run();
  };
  return debounced;
}

let seq = 0;
export function uid(prefix = 'kb'): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
