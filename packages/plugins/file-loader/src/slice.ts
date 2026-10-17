import { createSlice } from '@kabel/core';

export interface FileLoaderState {
  /** 是否正在加载 */
  busy: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    fileLoader: FileLoaderState;
  }
}

export const fileLoaderSlice = createSlice({
  name: 'fileLoader',
  initialState: { busy: false } as FileLoaderState,
  reducers: {
    setBusy: (s: FileLoaderState, busy: boolean) => (s.busy === busy ? s : { ...s, busy }),
  },
});

export const fileLoaderActions = fileLoaderSlice.actions;
