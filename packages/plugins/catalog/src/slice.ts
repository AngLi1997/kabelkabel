import { createSlice } from '@kabel/core';

/** 著录面板的界面状态（不纳入撤销）：分组折叠、“更多字段”展开 */
export interface CatalogState {
  collapsed: Record<string, boolean>;
  more: Record<string, boolean>;
}

declare module '@kabel/core' {
  interface KabelState {
    catalog: CatalogState;
  }
}

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: { collapsed: {}, more: {} } as CatalogState,
  reducers: {
    toggle: (s: CatalogState, group: string) => ({ ...s, collapsed: { ...s.collapsed, [group]: !s.collapsed[group] } }),
    setAll: (s: CatalogState, { groups, collapsed }: { groups: string[]; collapsed: boolean }) => ({
      ...s,
      collapsed: Object.fromEntries(groups.map((g) => [g, collapsed])),
    }),
    expand: (s: CatalogState, { group, more }: { group: string; more?: boolean }) => {
      const collapsed = s.collapsed[group] ? { ...s.collapsed, [group]: false } : s.collapsed;
      const expanded = more && !s.more[group] ? { ...s.more, [group]: true } : s.more;
      return collapsed === s.collapsed && expanded === s.more ? s : { collapsed, more: expanded };
    },
    toggleMore: (s: CatalogState, group: string) => ({ ...s, more: { ...s.more, [group]: !s.more[group] } }),
  },
});

export const catalogActions = catalogSlice.actions;
