import { clamp, createSlice } from '@kabel/core';
import type { ImageItem } from './sources';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.25;

export interface ViewerState {
  images: ImageItem[];
  index: number;
  /** `fit` 表示适应窗口 */
  zoom: number | 'fit';
  /** 适应窗口时的实际比例，由视图测量后回写 */
  fitScale: number;
  rotation: number;
  thumbnails: boolean;
  thumbSize: number;
  loading: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    viewer: ViewerState;
  }
  interface KabelEvents {
    'viewer:change': { index: number; image: ImageItem | undefined };
  }
}

export const initialViewerState: ViewerState = {
  images: [],
  index: 0,
  zoom: 'fit',
  fitScale: 1,
  rotation: 0,
  thumbnails: true,
  thumbSize: 88,
  loading: false,
};

export const currentScale = (s: ViewerState) => (s.zoom === 'fit' ? s.fitScale : s.zoom);

const resetView = (s: ViewerState): ViewerState => ({ ...s, zoom: 'fit', rotation: 0 });

export const viewerSlice = createSlice({
  name: 'viewer',
  initialState: initialViewerState,
  reducers: {
    setImages: (s: ViewerState, images: ImageItem[]) => resetView({ ...s, images, index: 0 }),
    setLoading: (s: ViewerState, loading: boolean) => ({ ...s, loading }),
    goto: (s: ViewerState, index: number) => {
      const next = clamp(Math.trunc(index), 0, Math.max(0, s.images.length - 1));
      return next === s.index ? s : resetView({ ...s, index: next });
    },
    next: (s: ViewerState) => (s.index < s.images.length - 1 ? resetView({ ...s, index: s.index + 1 }) : s),
    prev: (s: ViewerState) => (s.index > 0 ? resetView({ ...s, index: s.index - 1 }) : s),
    setZoom: (s: ViewerState, zoom: number | 'fit') => ({
      ...s,
      zoom: zoom === 'fit' ? 'fit' : clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    }),
    zoomBy: (s: ViewerState, factor: number) => ({ ...s, zoom: clamp(currentScale(s) * factor, MIN_ZOOM, MAX_ZOOM) }),
    setFitScale: (s: ViewerState, fitScale: number) => (Math.abs(s.fitScale - fitScale) < 1e-4 ? s : { ...s, fitScale }),
    rotate: (s: ViewerState, delta: number) => ({ ...s, rotation: (((s.rotation + delta) % 360) + 360) % 360 }),
    toggleThumbnails: (s: ViewerState) => ({ ...s, thumbnails: !s.thumbnails }),
    setThumbSize: (s: ViewerState, size: number) => ({ ...s, thumbSize: Math.round(clamp(size, 56, 200)) }),
  },
});

export const viewerActions = viewerSlice.actions;
