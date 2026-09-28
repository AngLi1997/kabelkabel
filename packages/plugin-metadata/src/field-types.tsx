import { defineExtensionPoint, type Kernel, type View } from '@kabel/core';
import { CheckboxGroup, Input, NumberInput, RadioGroup, Select, Textarea } from '@kabel/ui';
import type { NormalizedField } from './types';

export interface FieldViewProps {
  /** DOM id，label 的 for 指向它，focusField 也依赖它 */
  id: string;
  field: NormalizedField;
  value: unknown;
  onChange: (value: unknown) => void;
  onFocus: () => void;
  onBlur: () => void;
  disabled: boolean;
  invalid: boolean;
  kernel: Kernel;
}

export interface FieldTypeContribution {
  /** 字段类型名，即 Schema 中的 `type` */
  id: string;
  /** 显示名称（元数据设置中使用） */
  title?: string;
  order?: number;
  view: View<FieldViewProps>;
  /** 类型级校验，例如日期格式 */
  validate?: (value: unknown, field: NormalizedField) => string | null | undefined;
}

/** 字段类型扩展点：注册同名类型可覆盖内置实现 */
export const FieldTypes = defineExtensionPoint<FieldTypeContribution>('kabel.metadata.fieldTypes');

const str = (v: unknown) => (v == null ? '' : String(v));
const prop = <T,>(field: NormalizedField, key: string) => field.props?.[key] as T | undefined;

const TextField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <Input
    id={id}
    value={str(value)}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
    placeholder={field.placeholder}
    maxLength={field.maxLength}
  />
);

const TextareaField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <Textarea
    id={id}
    value={str(value)}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
    placeholder={field.placeholder}
    maxLength={field.maxLength}
    rows={prop<number>(field, 'rows') ?? 3}
  />
);

const NumberField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <NumberInput
    id={id}
    value={typeof value === 'number' ? value : value == null || value === '' ? null : Number(value)}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
    placeholder={field.placeholder}
    min={field.min}
    max={field.max}
    step={prop<number>(field, 'step')}
  />
);

/** 日期字段，支持 `props.valueFormat: 'YYYYMMDD'`（档案行业常用的 8 位日期）或默认 `YYYY-MM-DD` */
const compact = (field: NormalizedField) => prop<string>(field, 'valueFormat') === 'YYYYMMDD';
export const toIsoDate = (value: unknown, field: NormalizedField): string => {
  const s = str(value);
  return compact(field) && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
};
export const fromIsoDate = (value: string, field: NormalizedField): string =>
  compact(field) ? value.replace(/-/g, '') : value;

const DateField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <Input
    id={id}
    type="date"
    value={toIsoDate(value, field)}
    onChange={(v) => onChange(fromIsoDate(v, field))}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
  />
);

const SelectField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <Select
    id={id}
    value={value as string | number | null}
    options={field.options}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
    placeholder={field.placeholder}
  />
);

const RadioField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <RadioGroup
    id={id}
    name={id}
    value={value as string | number | null}
    options={field.options}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
  />
);

const CheckboxField = ({ id, field, value, onChange, onFocus, onBlur, disabled, invalid }: FieldViewProps) => (
  <CheckboxGroup
    id={id}
    value={Array.isArray(value) ? value : []}
    options={field.options}
    onChange={onChange}
    onFocus={onFocus}
    onBlur={onBlur}
    disabled={disabled}
    readOnly={field.readonly}
    invalid={invalid}
  />
);

const isValidDate = (value: unknown, field: NormalizedField) => {
  const iso = toIsoDate(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

export const builtinFieldTypes: FieldTypeContribution[] = [
  { id: 'text', title: '文本', view: TextField },
  { id: 'textarea', title: '多行文本', view: TextareaField },
  { id: 'number', title: '数字', view: NumberField },
  {
    id: 'date',
    title: '日期',
    view: DateField,
    validate: (value, field) => (isValidDate(value, field) ? null : `${field.label}日期格式不正确`),
  },
  { id: 'select', title: '下拉选择', view: SelectField },
  { id: 'radio', title: '单选', view: RadioField },
  { id: 'checkbox', title: '多选', view: CheckboxField },
];
