import type { RegionSelection } from './contract';

export interface ResultItem {
  id: string;
  /** 裁剪图的 object URL，由结果列表持有并在移除时释放 */
  url: string;
  blob: Blob;
  label: string;
  name: string;
}

/**
 * 面板用的最近结果列表：只在内存中保留最近 `limit` 条，object URL 在移除、清空、卸载时释放。
 * 这是面板自己的展示状态，不是框选的结果存储——下游仍应通过 `region:select` 取得结果。
 */
export function createResultList(limit: number) {
  let items: readonly ResultItem[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const revoke = (list: readonly ResultItem[]) => list.forEach((i) => URL.revokeObjectURL(i.url));

  return {
    get: () => items,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    add(selection: RegionSelection) {
      if (!selection.crop) return;
      const { crop, shape, document } = selection;
      const ext = crop.mime.split('/')[1] ?? 'png';
      const item: ResultItem = {
        id: selection.id,
        url: URL.createObjectURL(crop.blob),
        blob: crop.blob,
        label: `${crop.width}×${crop.height}`,
        name: `${document.name.replace(/\.[^.]+$/, '')}-${shape.type}-${crop.bbox.x}-${crop.bbox.y}.${ext}`,
      };
      const next = [item, ...items];
      revoke(next.slice(limit));
      items = next.slice(0, limit);
      emit();
    },
    remove(id: string) {
      revoke(items.filter((i) => i.id === id));
      items = items.filter((i) => i.id !== id);
      emit();
    },
    clear() {
      revoke(items);
      items = [];
      emit();
    },
  };
}

export type ResultList = ReturnType<typeof createResultList>;
