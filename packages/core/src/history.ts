import { createSlice, RESTORE_ACTION, type Action, type KabelState, type Store } from './store';
import type { Unsubscribe } from './utils';

export interface HistoryEntryInfo {
  id: number;
  label: string;
  time: number;
}

/** 历史状态也存放于 Store（`state.history`），因此 UI 可以像订阅普通状态一样订阅它 */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  /** 相对最近一次保存（或初始状态）是否有未保存修改 */
  dirty: boolean;
  /** 撤销栈，最早的在前 */
  past: HistoryEntryInfo[];
  /** 重做栈，最近撤销的在前 */
  future: HistoryEntryInfo[];
}

export interface HistoryOptions {
  /** 撤销栈上限，默认 100 */
  limit?: number;
  /** 合并窗口（毫秒），默认 1000 */
  coalesceWindow?: number;
  now?: () => number;
}

type Snapshot = Record<string, unknown>;

interface Entry extends HistoryEntryInfo {
  before: Snapshot;
  after: Snapshot;
  coalesce?: string;
}

const initialHistoryState: HistoryState = { canUndo: false, canRedo: false, dirty: false, past: [], future: [] };

export const historySlice = createSlice({
  name: 'history',
  initialState: initialHistoryState,
  reducers: {
    sync: (_state: HistoryState, next: HistoryState) => next,
  },
});

/**
 * 基于快照的撤销/重做。
 * 只记录 `history: true` 切片的变化；由于状态不可变，快照只保存引用，开销很小。
 */
export class History {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private seq = 0;
  private savedMarker = 0;
  private applying = false;
  private txDepth = 0;
  private txSnapshot: Snapshot | null = null;
  private txLabel = '';
  private readonly limit: number;
  private readonly window: number;
  private readonly now: () => number;
  private readonly unsubscribe: Unsubscribe;

  constructor(private readonly store: Store<KabelState>, options: HistoryOptions = {}) {
    this.limit = options.limit ?? 100;
    this.window = options.coalesceWindow ?? 1000;
    this.now = options.now ?? (() => Date.now());
    if (!store.hasSlice(historySlice.name)) store.registerSlice(historySlice);
    this.unsubscribe = store.subscribe((next, prev, action) => this.onChange(next, prev, action));
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.apply(entry.before, `撤销：${entry.label}`);
    this.future.unshift(entry);
    this.sync();
    return true;
  }

  redo(): boolean {
    const entry = this.future.shift();
    if (!entry) return false;
    this.apply(entry.after, `重做：${entry.label}`);
    this.past.push(entry);
    this.sync();
    return true;
  }

  /** 跳转到撤销栈中剩余 `size` 条记录的位置 */
  jump(size: number): void {
    while (this.past.length > size && this.undo());
    while (this.past.length < size && this.redo());
  }

  /** 将多次 dispatch 合并为一条历史记录 */
  transaction<T>(label: string, fn: () => T): T {
    if (this.txDepth === 0) {
      this.txSnapshot = this.snapshot(this.store.getState());
      this.txLabel = label;
    }
    this.txDepth += 1;
    try {
      return fn();
    } finally {
      this.txDepth -= 1;
      if (this.txDepth === 0) {
        const before = this.txSnapshot!;
        this.txSnapshot = null;
        const after = this.snapshot(this.store.getState());
        if (changed(before, after)) this.push({ label: this.txLabel, before, after });
      }
    }
  }

  /** 标记当前位置为“已保存”，用于计算 dirty */
  markSaved(): void {
    this.savedMarker = this.marker();
    this.sync();
  }

  /** 清空历史（例如载入新档案后） */
  clear(): void {
    this.past = [];
    this.future = [];
    this.savedMarker = 0;
    this.sync();
  }

  isDirty(): boolean {
    return this.marker() !== this.savedMarker;
  }

  getState(): HistoryState {
    return this.store.getState().history;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private marker(): number {
    return this.past.length ? this.past[this.past.length - 1]!.id : 0;
  }

  private snapshot(state: KabelState): Snapshot {
    const snap: Snapshot = {};
    for (const name of this.store.getHistorySlices()) snap[name] = state[name];
    return snap;
  }

  private apply(snapshot: Snapshot, label: string) {
    this.applying = true;
    try {
      this.store.dispatch({ type: RESTORE_ACTION, payload: snapshot, meta: { history: false, source: label } });
    } finally {
      this.applying = false;
    }
  }

  private onChange(next: KabelState, prev: KabelState, action: Action) {
    if (this.applying || this.txDepth > 0) return;
    if (action.type.startsWith(`${historySlice.name}/`)) return;
    const meta = action.meta?.history;
    if (meta === false) return;
    const before = this.snapshot(prev);
    const after = this.snapshot(next);
    if (!changed(before, after)) return;
    this.push({ label: meta?.label ?? action.type, coalesce: meta?.coalesce, before, after });
  }

  private push(input: { label: string; before: Snapshot; after: Snapshot; coalesce?: string }) {
    const time = this.now();
    const top = this.past[this.past.length - 1];
    const mergeable =
      input.coalesce &&
      top &&
      top.coalesce === input.coalesce &&
      time - top.time <= this.window &&
      top.id !== this.savedMarker &&
      this.future.length === 0;
    if (mergeable) {
      top.after = input.after;
      top.time = time;
    } else {
      this.seq += 1;
      this.past.push({ id: this.seq, time, ...input });
      if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
    }
    this.future = [];
    this.sync();
  }

  private sync() {
    const info = (e: Entry): HistoryEntryInfo => ({ id: e.id, label: e.label, time: e.time });
    this.store.dispatch(
      historySlice.actions.sync({
        canUndo: this.past.length > 0,
        canRedo: this.future.length > 0,
        dirty: this.isDirty(),
        past: this.past.map(info),
        future: this.future.map(info),
      }),
    );
  }
}

function changed(a: Snapshot, b: Snapshot): boolean {
  for (const key of Object.keys(b)) if (a[key] !== b[key]) return true;
  return false;
}
