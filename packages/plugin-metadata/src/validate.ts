import type { NormalizedField, NormalizedSchema, RecordValues } from './types';

export function isEmptyValue(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export type TypeValidator = (value: unknown, field: NormalizedField) => string | null | undefined;

/** 单字段校验，返回第一条错误信息或 null */
export function validateField(
  field: NormalizedField,
  value: unknown,
  values: RecordValues,
  typeValidator?: TypeValidator,
): string | null {
  if (field.hidden) return null;
  if (isEmptyValue(value)) return field.required ? `请填写${field.label}` : null;
  if (typeof value === 'string' && field.maxLength != null && value.length > field.maxLength) {
    return `${field.label}不能超过 ${field.maxLength} 个字符`;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return `${field.label}必须是数字`;
    if (field.min != null && value < field.min) return `${field.label}不能小于 ${field.min}`;
    if (field.max != null && value > field.max) return `${field.label}不能大于 ${field.max}`;
  }
  if (field.pattern != null && typeof value === 'string') {
    const re = typeof field.pattern === 'string' ? new RegExp(field.pattern) : field.pattern;
    if (!re.test(value)) return field.message ?? `${field.label}格式不正确`;
  }
  const typeError = typeValidator?.(value, field);
  if (typeError) return typeError;
  const custom = field.validator?.(value, values, field);
  return custom || null;
}

export function validateAll(
  schema: NormalizedSchema,
  values: RecordValues,
  typeValidators: Record<string, TypeValidator | undefined> = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of Object.values(schema.fields)) {
    const error = validateField(field, values[field.key], values, typeValidators[field.type]);
    if (error) errors[field.key] = error;
  }
  return errors;
}

/** 必填完成度 */
export function requiredProgress(schema: NormalizedSchema, values: RecordValues): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const field of Object.values(schema.fields)) {
    if (!field.required || field.hidden) continue;
    total += 1;
    if (!isEmptyValue(values[field.key])) filled += 1;
  }
  return { filled, total };
}
