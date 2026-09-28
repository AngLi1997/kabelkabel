import type { HistoryState } from './history';
import { toDisposable, type Disposable, type Unsubscribe } from './utils';

/**
 * 全局状态表，各插件通过模块扩充声明自己的切片类型：
 *
 * ```ts
 * declare module '@kabel/core' {
 *   interface KabelState { viewer: ViewerState }
 * }
 * ```
 */
export interface KabelState {
  history: HistoryState;
  [slice: string]: unknown;
}

export interface HistoryMeta {
  /** 撤销栈中显示的操作名称 */
  label?: string;
  /** 相同 key 的连续变更（在合并窗口内）会合并为一条历史记录，例如连续输入 */
  coalesce?: string;
}

export interface ActionMeta {
  /** `false` 表示本次变更不进入撤销栈 */
  history?: false | HistoryMeta;
  /** 变更来源，便于调试与审计 */
  source?: string;
  [key: string]: unknown;
}

export interface Action<P = unknown> {
  type: string;
  payload?: P;
  meta?: ActionMeta;
}

export type CaseReducer<S, P = any> = (state: S, payload: P, action: Action<P>) => S;
export type CaseReducers<S> = Record<string, CaseReducer<S, any>>;

type PayloadOf<F> = F extends (state: any, payload: infer P, ...rest: any[]) => any ? P : never;

export type ActionCreator<P> = (unknown extends P
  ? (payload?: P, meta?: ActionMeta) => Action<P>
  : [P] extends [undefined]
    ? (payload?: P, meta?: ActionMeta) => Action<P>
    : (payload: P, meta?: ActionMeta) => Action<P>) & { readonly type: string };

export type ActionCreators<R> = { [K in keyof R]: ActionCreator<PayloadOf<R[K]>> };

export interface SliceConfig<S, R extends CaseReducers<S>> {
  name: string;
  initialState: S | (() => S);
  reducers: R;
  /** 该切片的变更是否纳入撤销/重做 */
  history?: boolean;
  /** 响应其他切片或外部的 action */
  extraReducer?: (state: S, action: Action) => S;
}

export interface Slice<S = unknown, R extends CaseReducers<S> = CaseReducers<S>> {
  readonly name: string;
  readonly history: boolean;
  readonly actions: ActionCreators<R>;
  getInitialState(): S;
  reduce(state: S, action: Action): S;
  select(root: KabelState): S;
}

/** 声明一个状态切片。reducer 必须是纯函数且返回新对象（不可变更新）。 */
export function createSlice<S, R extends CaseReducers<S>>(config: SliceConfig<S, R>): Slice<S, R> {
  const prefix = `${config.name}/`;
  const actions = {} as Record<string, ActionCreator<unknown>>;
  for (const key of Object.keys(config.reducers)) {
    const type = prefix + key;
    const creator = ((payload?: unknown, meta?: ActionMeta) =>
      meta ? { type, payload, meta } : { type, payload }) as ActionCreator<unknown>;
    Object.defineProperty(creator, 'type', { value: type });
    actions[key] = creator;
  }
  const init = config.initialState;
  return {
    name: config.name,
    history: !!config.history,
    actions: actions as ActionCreators<R>,
    getInitialState: () => (typeof init === 'function' ? (init as () => S)() : init),
    reduce(state, action) {
      let next = state;
      if (action.type.startsWith(prefix)) {
        const reducer = config.reducers[action.type.slice(prefix.length)];
        if (reducer) next = reducer(next, action.payload, action);
      }
      if (config.extraReducer) next = config.extraReducer(next, action);
      return next;
    },
    select: (root) => root[config.name] as S,
  };
}

export type StoreListener<S = KabelState> = (state: S, prev: S, action: Action) => void;

export interface WatchOptions<T> {
  equals?: (a: T, b: T) => boolean;
  immediate?: boolean;
}

/** 内部 action：一次性覆盖若干切片（撤销/重做使用） */
export const RESTORE_ACTION = '@@store/restore';
export const REGISTER_ACTION = '@@store/register';
export const UNREGISTER_ACTION = '@@store/unregister';

/**
 * 可预测的单一状态树：所有变更必须经由 `dispatch(action)` 进入切片 reducer。
 */
export class Store<S extends KabelState = KabelState> {
  private state: S = {} as S;
  private slices = new Map<string, Slice<any, any>>();
  private listeners = new Set<StoreListener<S>>();
  private reducing = false;

  getState(): S {
    return this.state;
  }

  select<T>(selector: (state: S) => T): T {
    return selector(this.state);
  }

  hasSlice(name: string): boolean {
    return this.slices.has(name);
  }

  /** 返回纳入历史管理的切片名 */
  getHistorySlices(): string[] {
    const names: string[] = [];
    this.slices.forEach((slice, name) => {
      if (slice.history) names.push(name);
    });
    return names;
  }

  registerSlice<T>(slice: Slice<T, any>, preloadedState?: T): Disposable {
    if (this.slices.has(slice.name)) {
      throw new Error(`[kabel] slice "${slice.name}" is already registered`);
    }
    this.slices.set(slice.name, slice);
    const prev = this.state;
    this.state = { ...prev, [slice.name]: preloadedState ?? slice.getInitialState() };
    this.notify(prev, { type: REGISTER_ACTION, payload: slice.name, meta: { history: false } });
    return toDisposable(() => {
      if (this.slices.get(slice.name) !== slice) return;
      this.slices.delete(slice.name);
      const before = this.state;
      const next = { ...before };
      delete (next as KabelState)[slice.name];
      this.state = next;
      this.notify(before, { type: UNREGISTER_ACTION, payload: slice.name, meta: { history: false } });
    });
  }

  dispatch(action: Action): void {
    if (this.reducing) {
      throw new Error(`[kabel] reducers may not dispatch actions (while handling "${action.type}")`);
    }
    const prev = this.state;
    let next = prev;
    this.reducing = true;
    try {
      if (action.type === RESTORE_ACTION) {
        const patch = (action.payload ?? {}) as Record<string, unknown>;
        const copy = { ...prev } as KabelState;
        for (const key of Object.keys(patch)) {
          if (this.slices.has(key)) copy[key] = patch[key];
        }
        next = copy as S;
      } else {
        let copy: KabelState | undefined;
        this.slices.forEach((slice, name) => {
          const before = prev[name];
          const after = slice.reduce(before, action);
          if (after !== before) {
            copy ??= { ...prev };
            copy[name] = after;
          }
        });
        if (copy) next = copy as S;
      }
    } finally {
      this.reducing = false;
    }
    if (next === prev) return;
    this.state = next;
    this.notify(prev, action);
  }

  subscribe(listener: StoreListener<S>): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 监听选择器结果变化 */
  watch<T>(selector: (state: S) => T, callback: (value: T, prev: T) => void, options: WatchOptions<T> = {}): Unsubscribe {
    const equals = options.equals ?? Object.is;
    let current = selector(this.state);
    if (options.immediate) callback(current, current);
    return this.subscribe((state) => {
      const value = selector(state);
      if (equals(value, current)) return;
      const prev = current;
      current = value;
      callback(value, prev);
    });
  }

  private notify(prev: S, action: Action) {
    for (const listener of [...this.listeners]) {
      try {
        listener(this.state, prev, action);
      } catch (err) {
        console.error('[kabel] store listener failed', err);
      }
    }
  }
}
