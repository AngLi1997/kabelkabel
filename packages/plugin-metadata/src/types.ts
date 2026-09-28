import type { OptionItem } from '@kabel/ui';

export type { OptionItem };

/** 选项支持多种写法：`['永久','30年']`、`[{label,value}]`、`{ Y: '永久', D30: '定期30年' }` */
export type OptionsInput = readonly (string | number | OptionItem)[] | Record<string, string>;

export type FieldValidator = (
  value: unknown,
  values: Record<string, unknown>,
  field: NormalizedField,
) => string | null | undefined | void;

export interface FieldSchema {
  key: string;
  label: string;
  /** 字段类型，对应已注册的字段类型 id，默认 `text` */
  type?: string;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  /** 占用栅格列数，`full` 为整行 */
  span?: number | 'full';
  options?: OptionsInput;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string | RegExp;
  /** pattern 校验失败时的提示 */
  message?: string;
  validator?: FieldValidator;
  /** 透传给字段视图的额外属性 */
  props?: Record<string, unknown>;
}

export interface GroupSchema {
  key?: string;
  title: string;
  columns?: number;
  collapsed?: boolean;
  fields: FieldSchema[];
}

export interface MetadataSchema {
  id?: string;
  title?: string;
  /** 默认栅格列数（会随容器宽度自动减少），默认 2 */
  columns?: number;
  /** 标签宽度（px），默认 96 */
  labelWidth?: number;
  groups: GroupSchema[];
}

/** 支持完整 Schema、分组数组、字段数组、`{ fields }` 或 JSON 字符串 */
export type SchemaInput = MetadataSchema | GroupSchema[] | FieldSchema[] | { fields: FieldSchema[]; title?: string; columns?: number; labelWidth?: number } | string;

export interface NormalizedField extends Omit<FieldSchema, 'options' | 'span' | 'type'> {
  type: string;
  options: OptionItem[];
  span: number | 'full';
  group: string;
}

export interface NormalizedGroup {
  key: string;
  title: string;
  columns: number;
  collapsed: boolean;
  fields: NormalizedField[];
}

export interface NormalizedSchema {
  id: string;
  title?: string;
  columns: number;
  labelWidth: number;
  groups: NormalizedGroup[];
  fields: Record<string, NormalizedField>;
}

export type RecordValues = Record<string, unknown>;

export interface ArchiveRecord {
  id?: string;
  values: RecordValues;
}

/** 支持 `{ id, values }`、纯值对象或 JSON 字符串 */
export type RecordInput = ArchiveRecord | RecordValues | string | null | undefined;

export interface RecordState {
  id?: string;
  values: RecordValues;
}

export interface MetadataState {
  schema: NormalizedSchema;
  readonly: boolean;
  /** 分组折叠状态 */
  collapsed: Record<string, boolean>;
  /** 已交互过的字段，只对其展示校验错误 */
  touched: Record<string, boolean>;
  errors: Record<string, string>;
  /** 执行过整体校验后为时间戳，此后所有字段都实时展示错误 */
  validatedAt: number | null;
  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface SavePayload {
  record: ArchiveRecord;
  values: RecordValues;
}

declare module '@kabel/core' {
  interface KabelState {
    record: RecordState;
    metadata: MetadataState;
  }
  interface KabelEvents {
    /** 著录值变化（含撤销/重做） */
    'record:change': { record: ArchiveRecord; key?: string };
    /** 保存请求，处理器可返回 Promise；reject 视为保存失败 */
    save: SavePayload;
    saved: SavePayload;
    'save:error': { error: unknown };
    validate: ValidationResult;
    'field:focus': { key: string };
  }
}
