/** 当前工具打开的一个文件。`kind` 决定由哪个渲染器展示（如 `image`、`pdf`）。 */
export interface DocumentItem {
  id: string;
  name: string;
  /** 所属目录（如“正文”“附件”），文件目录按此分组 */
  group?: string;
  /** 文件类型，用于匹配渲染器 */
  kind: string;
  /** 可直接交给渲染器使用的地址（URL / data URL / blob URL） */
  src: string;
  thumbnail?: string;
  mime?: string;
}

export interface DocumentsState {
  items: DocumentItem[];
  index: number;
  loading: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    documents: DocumentsState;
  }
  interface KabelEvents {
    /** 当前文件变化（切换、替换文件列表） */
    'document:change': { index: number; document: DocumentItem | undefined };
  }
}
