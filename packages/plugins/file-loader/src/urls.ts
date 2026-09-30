import type { FileEntry } from './contract';

const nameOf = (url: string, index: number) => {
  if (url.startsWith('data:')) return `第 ${index + 1} 个`;
  try {
    return decodeURIComponent(url.split(/[?#]/)[0]!.split('/').filter(Boolean).pop() ?? '') || `第 ${index + 1} 个`;
  } catch {
    return `第 ${index + 1} 个`;
  }
};

/** 解析 URL 列表：按换行、逗号、分号分隔，去空白与重复，保持顺序；`#` 开头的行视为注释 */
export function parseUrlList(input: readonly string[] | string): string[] {
  const parts = typeof input === 'string' ? input.split(/[\r\n,;]+/) : input;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const url = raw.trim();
    if (!url || url.startsWith('#') || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** URL 无法判断类型时（无扩展名、对象存储地址等）默认按影像处理，由渲染器加载失败时提示 */
export function urlEntries(urls: readonly string[]): FileEntry[] {
  return urls.map((url, i) => ({ name: nameOf(url, i), url, mime: /^data:(image\/[^;,]+)/i.exec(url)?.[1] ?? 'image/*' }));
}
