import { createSlice } from '@kabel/core';
import type { TableRow, TableState } from './contract';

declare module '@kabel/core' {
  interface KabelState {
    table: Record<string, TableState>;
  }
}

type Tables = Record<string, TableState>;

const patch = (s: Tables, id: string, next: Partial<TableState>): Tables => {
  const table = s[id];
  return table ? { ...s, [id]: { ...table, ...next } } : s;
};

export const tableSlice = createSlice({
  name: 'table',
  initialState: {} as Tables,
  reducers: {
    init: (s: Tables, p: { id: string; state: TableState }) => ({ ...s, [p.id]: p.state }),
    remove: (s: Tables, id: string) => {
      if (!s[id]) return s;
      const { [id]: _, ...rest } = s;
      return rest;
    },
    loading: (s: Tables, p: { id: string; url?: string | null }) =>
      patch(s, p.id, { loading: true, error: null, ...(p.url !== undefined ? { url: p.url } : {}) }),
    loaded: (s: Tables, p: { id: string; rows: TableRow[]; total: number; page?: number; pageSize?: number; keepSelection?: boolean }) =>
      patch(s, p.id, {
        rows: p.rows,
        total: p.total,
        loading: false,
        error: null,
        ...(p.page !== undefined ? { page: p.page } : {}),
        ...(p.pageSize !== undefined ? { pageSize: p.pageSize } : {}),
        ...(p.keepSelection ? {} : { selected: null, checked: [] }),
        // 新数据即新的基线：清除编辑状态与修改标记
        editing: null,
        dirty: false,
        invalid: [],
      }),
    failed: (s: Tables, p: { id: string; error: string }) => patch(s, p.id, { loading: false, error: p.error }),
    setPage: (s: Tables, p: { id: string; page: number; pageSize: number }) => {
      const t = s[p.id];
      return !t || (t.page === p.page && t.pageSize === p.pageSize) ? s : patch(s, p.id, { page: p.page, pageSize: p.pageSize });
    },
    /** 合并更新一个表格的状态（编辑、勾选、提交等由插件计算好后一次写入） */
    patch: (s: Tables, p: { id: string; next: Partial<TableState> }) => patch(s, p.id, p.next),
    select: (s: Tables, p: { id: string; index: number | null }) =>
      s[p.id]?.selected === p.index ? s : patch(s, p.id, { selected: p.index }),
  },
});

export const tableActions = tableSlice.actions;
