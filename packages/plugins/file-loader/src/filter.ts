import type { FileEntry } from './contract';

/** 工作台影像渲染器能显示的扩展名 */
export const DEFAULT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff'];

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

export function isImageEntry(entry: FileEntry, extensions: readonly string[] = DEFAULT_IMAGE_EXTENSIONS): boolean {
  const mime = entry.mime ?? entry.file?.type;
  if (mime) return mime.startsWith('image/');
  return extensions.includes(extOf(entry.name));
}

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/** 按“目录 + 文件名”自然排序（2.jpg 在 10.jpg 之前） */
export function sortEntries<T extends { name: string; group?: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => collator.compare(a.group ?? '', b.group ?? '') || collator.compare(a.name, b.name));
}

/** 过滤出影像并排序 */
export function selectImages(entries: readonly FileEntry[], extensions?: readonly string[]) {
  const images = entries.filter((e) => isImageEntry(e, extensions));
  return { images: sortEntries(images), skipped: entries.length - images.length };
}
