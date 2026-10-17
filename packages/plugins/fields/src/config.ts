import { Schema } from '@kabel/core';
import type { FieldDefinition, FieldGroup, FieldType } from './contract';

/** 配置中的字段行（表格编辑）：可选值以逗号分隔 */
export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string;
  wide: boolean;
  more: boolean;
  hint: string;
}

export interface FieldGroupConfig {
  key: string;
  title: string;
  collapsed: boolean;
  fields: FieldConfig[];
}

export interface FieldsConfig {
  groups: FieldGroupConfig[];
  validateOnSave: boolean;
}

const FieldConfigSchema: Schema<Partial<FieldConfig>, FieldConfig> = Schema.object({
  key: Schema.string().required().description('标识'),
  label: Schema.string().required().description('名称'),
  type: Schema.union([
    Schema.const('text').description('文本'),
    Schema.const('textarea').description('多行文本'),
    Schema.const('date').description('日期'),
    Schema.const('number').description('数字'),
    Schema.const('select').description('下拉'),
    Schema.const('radio').description('单选'),
    Schema.const('checkbox').description('多选'),
  ])
    .default('text')
    .description('类型'),
  required: Schema.boolean().default(false).description('必填'),
  options: Schema.string().default('').description('可选值（逗号分隔）'),
  wide: Schema.boolean().default(false).description('整行'),
  more: Schema.boolean().default(false).description('更多'),
  hint: Schema.string().default('').description('提取提示'),
}) as never;

const FieldGroupSchema: Schema<Partial<FieldGroupConfig>, FieldGroupConfig> = Schema.object({
  key: Schema.string().required().description('分组标识'),
  title: Schema.string().required().description('分组名称'),
  collapsed: Schema.boolean().default(false).description('默认折叠'),
  fields: Schema.array(FieldConfigSchema).role('table').default([]).description('字段'),
}) as never;

export const FieldsConfigSchema: Schema<Partial<FieldsConfig>, FieldsConfig> = Schema.object({
  groups: Schema.array(FieldGroupSchema).default([]).description('字段分组'),
  validateOnSave: Schema.boolean().default(true).description('保存前校验必填'),
}) as never;

const splitOptions = (text: string) =>
  text
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** 配置 → 字段定义：拆分可选值，丢弃空 key，同 key 只保留第一个 */
export function toGroups(config: FieldsConfig): FieldGroup[] {
  const seen = new Set<string>();
  return config.groups.map((group) => ({
    key: group.key,
    title: group.title,
    collapsed: group.collapsed,
    fields: group.fields
      .filter((f) => f.key && !seen.has(f.key) && seen.add(f.key))
      .map(
        (f): FieldDefinition => ({
          key: f.key,
          label: f.label || f.key,
          type: f.type,
          required: f.required || undefined,
          options: f.options ? splitOptions(f.options) : undefined,
          wide: f.wide || undefined,
          more: f.more || undefined,
          hint: f.hint || undefined,
        }),
      ),
  }));
}

/** 便于预设书写的字段行：`field('name', '主体名称', { required: true })` */
export function field(key: string, label: string, extra: Partial<Omit<FieldConfig, 'key' | 'label'>> = {}): Partial<FieldConfig> {
  return { key, label, ...extra };
}
