import { createSlice } from '@kabel/core';

export interface LayoutExtractState {
  status: 'idle' | 'ocr' | 'llm' | 'done' | 'error';
  /** OCR 进度 */
  done: number;
  total: number;
  /** 本次回填的字段 */
  filled: string[];
  message: string | null;
}

declare module '@kabel/core' {
  interface KabelState {
    layoutExtract: LayoutExtractState;
  }
  interface KabelEvents {
    /**
     * 版面分析完成：`values` 为模型提取的原始结果，`filled` 为实际回填的字段。
     * @mode emit
     */
    'layout-extract:done': { values: Record<string, unknown>; filled: string[]; documentIds: string[] };
  }
}

const initial: LayoutExtractState = { status: 'idle', done: 0, total: 0, filled: [], message: null };

export const layoutExtractSlice = createSlice({
  name: 'layoutExtract',
  initialState: initial,
  reducers: {
    start: (_s: LayoutExtractState, total: number) => ({ ...initial, status: 'ocr' as const, total }),
    progress: (s: LayoutExtractState, done: number) => ({ ...s, done }),
    extracting: (s: LayoutExtractState) => ({ ...s, status: 'llm' as const }),
    done: (s: LayoutExtractState, filled: string[]) => ({ ...s, status: 'done' as const, filled }),
    fail: (s: LayoutExtractState, message: string) => ({ ...s, status: 'error' as const, message }),
    reset: () => initial,
  },
});

export const layoutExtractActions = layoutExtractSlice.actions;
