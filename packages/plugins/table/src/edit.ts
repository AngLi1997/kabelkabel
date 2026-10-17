import type { TableCellRef, TableChanges, TableColumn, TableRow } from './contract';
import { getField } from './source';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 不可变地写入字段，`key` 支持 `a.b` 嵌套路径（与 `getField` 对应） */
export function setField(row: TableRow, key: string, value: unknown): TableRow {
  if (key in row || !key.includes('.')) return { ...row, [key]: value };
  const [head, ...rest] = key.split('.') as [string, ...string[]];
  const child = isRecord(row[head]) ? (row[head] as TableRow) : {};
  return { ...row, [head]: setField(child, rest.join('.'), value) };
}

/** 必填判断：空字符串、null、undefined、空数组视为未填 */
export const isEmptyValue = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);

const sameRow = (a: TableRow, b: TableRow) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  return true;
};

/**
 * 修改追踪：以上次加载 / 提交时的行为基线，记录每个新行对象来自哪一行（`null` 为新增）。
 * 行对象不可变，因此不需要在行数据里加任何隐藏字段，提交数据保持原样。
 */
export class ChangeTracker {
  baseline: TableRow[] = [];
  private origin = new WeakMap<TableRow, TableRow | null>();

  reset(rows: TableRow[]): void {
    this.baseline = rows;
    this.origin = new WeakMap();
  }

  markAdded(row: TableRow): void {
    this.origin.set(row, null);
  }

  /** `next` 由 `prev` 修改而来 */
  derive(next: TableRow, prev: TableRow): void {
    this.origin.set(next, this.origin.has(prev) ? this.origin.get(prev)! : prev);
  }

  /** 行的原值：`null` 为新增行，`undefined` 为未修改的基线行 */
  originalOf(row: TableRow): TableRow | null | undefined {
    return this.origin.get(row);
  }

  changes(rows: readonly TableRow[]): TableChanges {
    const added: TableRow[] = [];
    const updated: TableChanges['updated'] = [];
    const kept = new Set<TableRow>();
    rows.forEach((row, index) => {
      const original = this.origin.get(row);
      if (original === null) return void added.push(row);
      kept.add(original ?? row);
      if (original && !sameRow(row, original)) updated.push({ index, row, original });
    });
    return { added, updated, removed: this.baseline.filter((row) => !kept.has(row)) };
  }

  isDirty(rows: readonly TableRow[]): boolean {
    const { added, updated, removed } = this.changes(rows);
    return added.length + updated.length + removed.length > 0;
  }

  /** 单元格值是否不同于原值（新增行的单元格都视为修改） */
  isCellChanged(row: TableRow, key: string): boolean {
    const original = this.origin.get(row);
    if (original === undefined) return false;
    if (original === null) return true;
    return JSON.stringify(getField(row, key)) !== JSON.stringify(getField(original, key));
  }
}

/** 校验必填列 */
export function validateRows(rows: readonly TableRow[], columns: readonly TableColumn[]): TableCellRef[] {
  const required = columns.filter((c) => c.required);
  const invalid: TableCellRef[] = [];
  rows.forEach((row, index) => {
    for (const c of required) if (isEmptyValue(getField(row, c.key))) invalid.push({ index, key: c.key });
  });
  return invalid;
}

/** 删除行后，按行对象把旧下标映射到新下标（行已删除的丢弃） */
export function remapIndexes(indexes: readonly number[], before: readonly TableRow[], after: readonly TableRow[]): number[] {
  const position = new Map(after.map((row, i) => [row, i] as const));
  return indexes.map((i) => position.get(before[i]!)).filter((i): i is number => i !== undefined).sort((a, b) => a - b);
}

/** 编辑器取值：数字列转为数字（空为 null） */
export function parseCellValue(column: TableColumn, raw: string): unknown {
  if (column.type === 'number') {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (column.type === 'select') {
    const option = (column.options ?? []).find((o) => String(typeof o === 'object' ? o.value : o) === raw);
    return option === undefined ? raw : typeof option === 'object' ? option.value : option;
  }
  return raw;
}
