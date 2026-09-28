import { isPlainObject } from '@kabel/core';
import type {
  ArchiveRecord,
  FieldSchema,
  GroupSchema,
  MetadataSchema,
  NormalizedField,
  NormalizedSchema,
  OptionItem,
  OptionsInput,
  RecordInput,
  SchemaInput,
} from './types';

export function normalizeOptions(input: OptionsInput | undefined): OptionItem[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((item) =>
      typeof item === 'object' && item !== null ? { ...item } : { label: String(item), value: item as string | number },
    );
  }
  return Object.entries(input as Record<string, string>).map(([value, label]) => ({ value, label: String(label) }));
}

function parseJson<T>(input: string, what: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    throw new Error(`[kabel] invalid ${what} JSON`);
  }
}

function toGroups(input: SchemaInput): { groups: GroupSchema[]; meta: Partial<NormalizedSchema> } {
  const value = typeof input === 'string' ? parseJson<SchemaInput>(input, 'schema') : input;
  if (Array.isArray(value)) {
    if (!value.length) return { groups: [], meta: {} };
    if ('fields' in (value[0] as object)) return { groups: value as GroupSchema[], meta: {} };
    return { groups: [{ title: '基本信息', fields: value as FieldSchema[] }], meta: {} };
  }
  const obj = value as Record<string, unknown>;
  const meta = { id: obj.id as string, title: obj.title as string, columns: obj.columns as number, labelWidth: obj.labelWidth as number };
  if (Array.isArray(obj.groups)) return { groups: obj.groups as GroupSchema[], meta };
  if (Array.isArray(obj.fields)) return { groups: [{ title: (obj.title as string) ?? '基本信息', fields: obj.fields as FieldSchema[] }], meta };
  throw new Error('[kabel] schema must contain "groups" or "fields"');
}

/** 将多种 Schema 写法归一化；字段 key 重复会报错 */
export function normalizeSchema(input: SchemaInput | undefined): NormalizedSchema {
  const { groups, meta } = input ? toGroups(input) : { groups: [], meta: {} };
  const columns = meta.columns ?? 2;
  const fields: Record<string, NormalizedField> = {};
  const normalizedGroups = groups.map((group, index) => {
    const key = group.key ?? `group-${index}`;
    return {
      key,
      title: group.title,
      columns: group.columns ?? columns,
      collapsed: !!group.collapsed,
      fields: group.fields.map((field) => {
        if (!field.key) throw new Error(`[kabel] field in group "${group.title}" is missing "key"`);
        if (fields[field.key]) throw new Error(`[kabel] duplicate field key "${field.key}"`);
        const normalized: NormalizedField = {
          ...field,
          type: field.type ?? 'text',
          options: normalizeOptions(field.options),
          span: field.span ?? 1,
          group: key,
        };
        fields[field.key] = normalized;
        return normalized;
      }),
    };
  });
  return {
    id: meta.id ?? 'schema',
    title: meta.title,
    columns,
    labelWidth: meta.labelWidth ?? 96,
    groups: normalizedGroups,
    fields,
  };
}

/** 归一化 Schema 还原为完整 Schema 写法（可再次 normalize，可序列化为 JSON；自定义 validator 保留在对象中但无法序列化） */
export function toSchemaInput(schema: NormalizedSchema): MetadataSchema {
  return {
    id: schema.id,
    title: schema.title,
    columns: schema.columns,
    labelWidth: schema.labelWidth,
    groups: schema.groups.map((g) => ({
      key: g.key,
      title: g.title,
      columns: g.columns,
      collapsed: g.collapsed,
      fields: g.fields.map(({ group: _group, options, ...field }) => (options.length ? { ...field, options } : field)),
    })),
  };
}

/** `{ id, values }` 视为结构化档案，其余对象视为纯值对象 */
export function normalizeRecord(input: RecordInput, schema?: NormalizedSchema): ArchiveRecord {
  let value: unknown = input;
  if (typeof value === 'string') value = parseJson<unknown>(value, 'record');
  let record: ArchiveRecord;
  if (isPlainObject(value) && isPlainObject(value.values)) {
    record = { id: value.id == null ? undefined : String(value.id), values: { ...value.values } };
  } else if (isPlainObject(value)) {
    record = { values: { ...value } };
  } else {
    record = { values: {} };
  }
  if (schema) {
    for (const field of Object.values(schema.fields)) {
      if (record.values[field.key] === undefined && field.defaultValue !== undefined) {
        record.values[field.key] = field.defaultValue;
      }
    }
  }
  return record;
}
