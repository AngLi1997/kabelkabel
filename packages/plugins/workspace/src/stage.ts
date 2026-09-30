import { clamp, createSlice } from '@kabel/core';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.25;

/** 当前占用舞台指针的交互工具（由 `WorkspaceService.acquireTool` 租约设置） */
export interface ActiveStageTool {
  id: string;
  /** 工具激活时舞台的 CSS 光标，默认 `crosshair` */
  cursor?: string;
}

export interface StageState {
  /** `fit` 表示适应窗口 */
  zoom: number | 'fit';
  /** 适应窗口时的实际比例，由视图测量后回写 */
  fitScale: number;
  rotation: number;
  thumbnails: boolean;
  thumbSize: number;
  /** 当前交互工具；为空时左 / 右 / 中键拖动均为平移 */
  tool: ActiveStageTool | null;
}

declare module '@kabel/core' {
  interface KabelState {
    stage: StageState;
  }
}

export const initialStageState: StageState = {
  zoom: 'fit',
  fitScale: 1,
  rotation: 0,
  thumbnails: false,
  thumbSize: 88,
  tool: null,
};

export const currentScale = (s: StageState) => (s.zoom === 'fit' ? s.fitScale : s.zoom);


export const stageSlice = createSlice({
  name: 'stage',
  initialState: initialStageState,
  reducers: {
    /** 切换文件时恢复适应窗口与不旋转 */
    reset: (s: StageState) => (s.zoom === 'fit' && s.rotation === 0 ? s : { ...s, zoom: 'fit', rotation: 0 }),
    setZoom: (s: StageState, zoom: number | 'fit') => ({
      ...s,
      zoom: zoom === 'fit' ? 'fit' : clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    }),
    zoomBy: (s: StageState, factor: number) => ({ ...s, zoom: clamp(currentScale(s) * factor, MIN_ZOOM, MAX_ZOOM) }),
    setFitScale: (s: StageState, fitScale: number) => (Math.abs(s.fitScale - fitScale) < 1e-4 ? s : { ...s, fitScale }),
    rotate: (s: StageState, delta: number) => ({ ...s, rotation: (((s.rotation + delta) % 360) + 360) % 360 }),
    toggleThumbnails: (s: StageState) => ({ ...s, thumbnails: !s.thumbnails }),
    setTool: (s: StageState, tool: ActiveStageTool | null) => (s.tool?.id === tool?.id && s.tool?.cursor === tool?.cursor ? s : { ...s, tool }),
    setThumbSize: (s: StageState, size: number) => ({ ...s, thumbSize: Math.round(clamp(size, 56, 240)) }),
  },
});

export const stageActions = stageSlice.actions;
