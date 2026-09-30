import { createSlice } from '@kabel/core';

export type LoaderDialog = 'urls' | 'minio' | null;

export interface FileLoaderState {
  /** 当前打开的加载对话框 */
  dialog: LoaderDialog;
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
  initialState: { dialog: null, busy: false } as FileLoaderState,
  reducers: {
    openDialog: (s: FileLoaderState, dialog: LoaderDialog) => (s.dialog === dialog ? s : { ...s, dialog }),
    setBusy: (s: FileLoaderState, busy: boolean) => (s.busy === busy ? s : { ...s, busy }),
  },
});

export const fileLoaderActions = fileLoaderSlice.actions;
