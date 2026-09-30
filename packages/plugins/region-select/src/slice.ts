import { createSlice } from '@kabel/core';
import type { RegionBBox, RegionShape, RegionShapeType } from './contract';

export interface RegionSelectState {
  /** 当前激活的形状类型；为空表示框选未激活 */
  tool: RegionShapeType | null;
  /** 绘制中的草稿（图片像素坐标） */
  draft: RegionShape | null;
  /** 正在裁剪 */
  busy: boolean;
  /** 最近一次框选的元数据（不含图片数据） */
  last: { id: string; documentId: string; shape: RegionShape; bbox: RegionBBox } | null;
}

declare module '@kabel/core' {
  interface KabelState {
    regionSelect: RegionSelectState;
  }
}

export const regionSelectSlice = createSlice({
  name: 'regionSelect',
  initialState: { tool: null, draft: null, busy: false, last: null } as RegionSelectState,
  reducers: {
    activate: (s: RegionSelectState, tool: RegionShapeType) => (s.tool === tool ? s : { ...s, tool, draft: null }),
    deactivate: (s: RegionSelectState) => (s.tool === null && s.draft === null ? s : { ...s, tool: null, draft: null }),
    setDraft: (s: RegionSelectState, draft: RegionShape | null) => (s.draft === null && draft === null ? s : { ...s, draft }),
    setBusy: (s: RegionSelectState, busy: boolean) => (s.busy === busy ? s : { ...s, busy }),
    setLast: (s: RegionSelectState, last: RegionSelectState['last']) => ({ ...s, last }),
  },
});

export const regionSelectActions = regionSelectSlice.actions;
