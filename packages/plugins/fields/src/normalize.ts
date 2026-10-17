import type { FieldDefinition, FieldRaw } from './contract';

const pad = (n: string) => n.padStart(2, '0');

/** 日期规整为 `YYYY-MM-DD`：支持 2026年8月11日、2026.8.11、2026/08/11、20260811；无法识别时原样返回 */
export function normalizeDate(text: string): string {
  const t = text.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(t.replace(/\s/g, ''));
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const m = /(\d{4})\s*[年./\-－—]\s*(\d{1,2})\s*[月./\-－—]\s*(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad(m[2]!)}-${pad(m[3]!)}`;
  return t;
}

/** 在可选值中匹配：完全相等 > 文本包含选项 > 选项包含文本 */
export function matchOption(text: string, options: readonly string[]): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  return options.find((o) => o === t) ?? options.find((o) => t.includes(o)) ?? options.find((o) => o.includes(t));
}

const toText = (value: unknown): string => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(toText).join('、');
  if (typeof value === 'object') {
    const v = (value as Record<string, unknown>).value;
    return v === undefined ? JSON.stringify(value) : toText(v);
  }
  return String(value);
};

/** 按字段类型把任意输入（人工输入、识别文本、模型输出）规整为字段值 */
export function normalizeValue(field: FieldDefinition | undefined, value: unknown): FieldRaw {
  if (!field) return value == null ? null : (value as FieldRaw);
  const options = field.options ?? [];
  switch (field.type) {
    case 'checkbox': {
      const parts = Array.isArray(value) ? value.map(toText) : toText(value).split(/[,，、;；\s]+/);
      const picked = parts.map((p) => (options.length ? matchOption(p, options) : p.trim())).filter((p): p is string => !!p);
      return [...new Set(picked)];
    }
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      const m = /-?\d+(?:\.\d+)?/.exec(toText(value).replace(/[,，\s]/g, ''));
      return m ? Number(m[0]) : null;
    }
    case 'date':
      return normalizeDate(toText(value));
    case 'select':
    case 'radio': {
      const text = toText(value).trim();
      return (options.length ? matchOption(text, options) : undefined) ?? text;
    }
    case 'textarea':
      return toText(value).trim();
    default:
      // 单行文本：识别结果中的换行直接拼接
      return toText(value)
        .replace(/\s*\n\s*/g, '')
        .trim();
  }
}

export const isEmptyValue = (value: FieldRaw | undefined): boolean =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);
