import { createSlice } from '@kabel/core';

/** 框选识别的进行状态（不纳入撤销） */
export interface ExcerptState {
  /** 正在为哪个字段框选 / 识别 */
  target: string | null;
  phase: 'idle' | 'picking' | 'recognizing';
  error: string | null;
}

declare module '@kabel/core' {
  interface KabelState {
    excerpt: ExcerptState;
  }
  interface KabelEvents {
    /**
     * 框选识别完成并已回填。
     * @mode emit
     */
    'excerpt:fill': { key: string; text: string; documentId: string };
  }
}

export const excerptSlice = createSlice({
  name: 'excerpt',
  initialState: { target: null, phase: 'idle', error: null } as ExcerptState,
  reducers: {
    start: (_s: ExcerptState, target: string) => ({ target, phase: 'picking' as const, error: null }),
    recognizing: (s: ExcerptState) => ({ ...s, phase: 'recognizing' as const }),
    done: () => ({ target: null, phase: 'idle' as const, error: null }),
    fail: (_s: ExcerptState, error: string) => ({ target: null, phase: 'idle' as const, error }),
  },
});

export const excerptActions = excerptSlice.actions;
