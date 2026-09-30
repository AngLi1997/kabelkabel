import { clamp, createSlice } from '@kabel/core';
import type { DocumentItem, DocumentsState } from './types';

export const initialDocumentsState: DocumentsState = { items: [], index: 0, loading: false };

export const documentsSlice = createSlice({
  name: 'documents',
  initialState: initialDocumentsState,
  reducers: {
    set: (s: DocumentsState, items: DocumentItem[]) => ({ ...s, items, index: 0 }),
    setLoading: (s: DocumentsState, loading: boolean) => (s.loading === loading ? s : { ...s, loading }),
    goto: (s: DocumentsState, index: number) => {
      const next = clamp(Math.trunc(index), 0, Math.max(0, s.items.length - 1));
      return next === s.index ? s : { ...s, index: next };
    },
    next: (s: DocumentsState) => (s.index < s.items.length - 1 ? { ...s, index: s.index + 1 } : s),
    prev: (s: DocumentsState) => (s.index > 0 ? { ...s, index: s.index - 1 } : s),
  },
});

export const documentsActions = documentsSlice.actions;

export interface DocumentGroup {
  /** 目录名；未分组的文件为空字符串 */
  name: string;
  /** 在文件列表中的起始下标 */
  start: number;
  items: DocumentItem[];
}

/** 按目录把文件分段（相邻同名目录合并为一段，保持原顺序） */
export function groupDocuments(items: readonly DocumentItem[]): DocumentGroup[] {
  const groups: DocumentGroup[] = [];
  items.forEach((item, i) => {
    const name = item.group ?? '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, start: i, items: [item] });
  });
  return groups;
}

/** 当前位置：目录名、目录内序号与文件数 */
export function documentPosition(s: Pick<DocumentsState, 'items' | 'index'>) {
  const group = groupDocuments(s.items).find((g) => s.index >= g.start && s.index < g.start + g.items.length);
  return {
    total: s.items.length,
    page: s.items.length ? s.index + 1 : 0,
    group: group?.name ?? '',
    groupPage: group ? s.index - group.start + 1 : 0,
    groupTotal: group?.items.length ?? 0,
  };
}
