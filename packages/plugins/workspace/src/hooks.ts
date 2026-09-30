import { useSelector } from '@kabel/ui';
import type { DocumentItem, DocumentsState } from './documents/types';
import type { StageState } from './stage';

/** 文件列表、当前下标与加载状态 */
export function useDocuments(): DocumentsState {
  return useSelector((s) => s.documents);
}

/** 当前文件（没有打开文件时为 undefined） */
export function useCurrentDocument(): DocumentItem | undefined {
  return useSelector((s) => s.documents.items[s.documents.index]);
}

/** 影像舞台状态：缩放、旋转、适应窗口比例… */
export function useStage(): StageState {
  return useSelector((s) => s.stage);
}
