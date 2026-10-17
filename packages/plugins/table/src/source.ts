import type { TablePage, TableQuery, TableRow } from './contract';

const LIST_KEYS = ['rows', 'list', 'records', 'items', 'data'] as const;
const TOTAL_KEYS = ['total', 'totalCount', 'count'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const asRows = (list: unknown[]): TableRow[] => list.filter(isRecord);

/**
 * 解析常见的接口返回形态：
 * 数组；`{ rows | list | records | items | data: [], total }`；以及包了一层 `{ code, data: { … } }` 的结构。
 */
export function parseResponse(response: unknown): TablePage {
  if (Array.isArray(response)) return { rows: asRows(response), total: response.length };
  if (!isRecord(response)) throw new Error('接口返回的不是表格数据');
  for (const key of LIST_KEYS) {
    const list = response[key];
    if (Array.isArray(list)) {
      const total = TOTAL_KEYS.map((k) => response[k]).find((v) => typeof v === 'number' && Number.isFinite(v));
      return { rows: asRows(list), total: (total as number | undefined) ?? list.length };
    }
  }
  if (isRecord(response.data)) return parseResponse(response.data);
  throw new Error('接口返回中没有找到数据列表');
}

/** 统一为分页结果 */
export const toPage = (result: TableRow[] | TablePage): TablePage =>
  Array.isArray(result) ? { rows: result, total: result.length } : result;

/** 后端分页：在 URL 上附加 `page`、`pageSize` 参数（保留已有参数与 hash） */
export function withQuery(url: string, query: TableQuery): string {
  const [base, hash] = url.split('#', 2) as [string, string | undefined];
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}page=${query.page}&pageSize=${query.pageSize}${hash !== undefined ? `#${hash}` : ''}`;
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`请求失败：${res.status} ${res.statusText}`.trim());
  return res.json();
}

/** 读取字段，支持 `a.b` 嵌套路径 */
export function getField(row: TableRow, key: string): unknown {
  if (key in row) return row[key];
  let value: unknown = row;
  for (const part of key.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

export const cellText = (value: unknown): string =>
  value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

/** 页码按钮：首尾页 + 当前页附近，其余以省略号（`null`）表示 */
export function pageItems(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}
