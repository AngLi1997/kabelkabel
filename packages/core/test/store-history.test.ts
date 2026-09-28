import { describe, expect, it, vi } from 'vitest';
import { createSlice, History, Store } from '../src';

const counter = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  history: true,
  reducers: {
    add: (s: { value: number }, n: number) => ({ value: s.value + n }),
    reset: () => ({ value: 0 }),
  },
});

const ui = createSlice({
  name: 'ui',
  initialState: { open: false },
  reducers: { toggle: (s: { open: boolean }) => ({ open: !s.open }) },
});

function setup(now = () => 0) {
  const store = new Store();
  const history = new History(store, { now });
  store.registerSlice(counter);
  store.registerSlice(ui);
  const value = () => (store.getState().counter as { value: number }).value;
  return { store, history, value };
}

describe('Store', () => {
  it('action creator 生成带命名空间的 type', () => {
    expect(counter.actions.add(1)).toEqual({ type: 'counter/add', payload: 1 });
    expect(counter.actions.add.type).toBe('counter/add');
  });

  it('无变化时不通知', () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: 'unknown' });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch(counter.actions.add(1));
    expect(listener).toHaveBeenCalledTimes(2); // counter + history/sync
  });

  it('未变化的切片保持引用', () => {
    const { store } = setup();
    const before = store.getState().ui;
    store.dispatch(counter.actions.add(1));
    expect(store.getState().ui).toBe(before);
  });

  it('watch 仅在选择结果变化时回调', () => {
    const { store } = setup();
    const cb = vi.fn();
    store.watch((s) => (s.counter as { value: number }).value, cb);
    store.dispatch(ui.actions.toggle());
    store.dispatch(counter.actions.add(2));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2, 0);
  });

  it('reducer 中禁止 dispatch', () => {
    const store = new Store();
    const bad = createSlice({
      name: 'bad',
      initialState: 0,
      reducers: {
        go: (s: number) => {
          store.dispatch({ type: 'x' });
          return s;
        },
      },
    });
    store.registerSlice(bad);
    expect(() => store.dispatch(bad.actions.go())).toThrow(/may not dispatch/);
  });

  it('注销切片后状态移除', () => {
    const store = new Store();
    const d = store.registerSlice(ui);
    expect(store.getState().ui).toBeDefined();
    d.dispose();
    expect('ui' in store.getState()).toBe(false);
  });
});

describe('History', () => {
  it('撤销/重做只作用于 history 切片', () => {
    const { store, history, value } = setup();
    store.dispatch(counter.actions.add(1, { history: { label: '+1' } }));
    store.dispatch(ui.actions.toggle());
    store.dispatch(counter.actions.add(2));
    expect(value()).toBe(3);
    expect(store.getState().history.past.map((e) => e.label)).toEqual(['+1', 'counter/add']);
    history.undo();
    expect(value()).toBe(1);
    expect((store.getState().ui as { open: boolean }).open).toBe(true);
    history.redo();
    expect(value()).toBe(3);
  });

  it('新变更清空重做栈', () => {
    const { store, history } = setup();
    store.dispatch(counter.actions.add(1));
    history.undo();
    expect(history.canRedo).toBe(true);
    store.dispatch(counter.actions.add(5));
    expect(history.canRedo).toBe(false);
  });

  it('合并窗口内的相同 coalesce 合并为一条', () => {
    let t = 0;
    const { store, history, value } = setup(() => t);
    const meta = { history: { coalesce: 'typing' } };
    store.dispatch(counter.actions.add(1, meta));
    t = 500;
    store.dispatch(counter.actions.add(1, meta));
    t = 3000;
    store.dispatch(counter.actions.add(1, meta));
    expect(store.getState().history.past).toHaveLength(2);
    history.undo();
    expect(value()).toBe(2);
    history.undo();
    expect(value()).toBe(0);
  });

  it('meta.history=false 不记录', () => {
    const { store } = setup();
    store.dispatch(counter.actions.add(1, { history: false }));
    expect(store.getState().history.canUndo).toBe(false);
  });

  it('transaction 合并多次变更', () => {
    const { store, history, value } = setup();
    history.transaction('批量', () => {
      store.dispatch(counter.actions.add(1));
      store.dispatch(counter.actions.add(1));
    });
    expect(store.getState().history.past).toEqual([expect.objectContaining({ label: '批量' })]);
    history.undo();
    expect(value()).toBe(0);
  });

  it('dirty 跟随保存点', () => {
    const { store, history } = setup();
    expect(history.isDirty()).toBe(false);
    store.dispatch(counter.actions.add(1));
    expect(store.getState().history.dirty).toBe(true);
    history.markSaved();
    expect(store.getState().history.dirty).toBe(false);
    history.undo();
    expect(store.getState().history.dirty).toBe(true);
    history.redo();
    expect(store.getState().history.dirty).toBe(false);
  });

  it('jump 跳转到指定位置', () => {
    const { store, history, value } = setup();
    for (let i = 0; i < 4; i += 1) store.dispatch(counter.actions.add(1));
    history.jump(1);
    expect(value()).toBe(1);
    history.jump(3);
    expect(value()).toBe(3);
  });

  it('超出上限时丢弃最早记录', () => {
    const store = new Store();
    const history = new History(store, { limit: 2 });
    store.registerSlice(counter);
    for (let i = 0; i < 5; i += 1) store.dispatch(counter.actions.add(1));
    expect(store.getState().history.past).toHaveLength(2);
    history.undo();
    history.undo();
    expect(history.undo()).toBe(false);
  });
});
