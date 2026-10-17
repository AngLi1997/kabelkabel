import { createServiceToken, defineExtensionPoint, type Kernel } from '@kabel/core';

/**
 * 字段模型的对外契约：所有“读写字段值”的插件（著录面板、框选识别、版面分析、宿主…）只依赖这里的
 * 令牌、类型、事件与扩展点，彼此不知道对方存在。
 */

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'select' | 'radio' | 'checkbox';

/** 字段定义（来自插件配置，设置 › 插件管理 › 字段模型 中可编辑） */
export interface FieldDefinition {
  /** 字段标识，同一配置内唯一，用作值的键与提取结果的键 */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** 可选值（select / radio / checkbox） */
  options?: string[];
  placeholder?: string;
  /** 校验正则 */
  pattern?: string;
  /** 占整行（著录面板多列布局时） */
  wide?: boolean;
  /** 折叠在“更多字段”中 */
  more?: boolean;
  /** 给智能提取的说明（如“营业执照上的统一社会信用代码，18 位”） */
  hint?: string;
  /** 是否允许框选识别回填，默认 true */
  ocr?: boolean;
}

/** 字段分组（如“主体信息”“事项信息”） */
export interface FieldGroup {
  key: string;
  title: string;
  /** 初始折叠 */
  collapsed?: boolean;
  fields: FieldDefinition[];
}

export type FieldScalar = string | number | null;
export type FieldRaw = FieldScalar | string[];

/** 值的来源：人工输入、框选识别、智能提取、宿主载入 */
export type FieldSource = 'user' | 'ocr' | 'ai' | 'host' | (string & {});

/** 值在影像上的证据位置（图片像素坐标） */
export interface FieldEvidence {
  documentId: string;
  bbox?: { x: number; y: number; width: number; height: number };
  /** 识别出的原文 */
  text?: string;
}

export interface FieldValue {
  value: FieldRaw;
  source: FieldSource;
  /** 机器填写的值需要人工复核：`pending` 待复核，`confirmed` 已确认 */
  review?: 'pending' | 'confirmed';
  evidence?: FieldEvidence;
  /** 置信度 0–1（若来源提供） */
  confidence?: number;
}

export interface SetFieldOptions {
  source?: FieldSource;
  review?: FieldValue['review'];
  evidence?: FieldEvidence;
  confidence?: number;
  /** 撤销栈中的记录名 */
  label?: string;
}

/** 字段值（纳入撤销） */
export interface FieldsState {
  values: Record<string, FieldValue>;
}

/** 字段界面状态（不纳入撤销）：分组配置、焦点、校验错误 */
export interface FieldsViewState {
  groups: FieldGroup[];
  focus: string | null;
  errors: Record<string, string>;
}

declare module '@kabel/core' {
  interface KabelState {
    fields: FieldsState;
    fieldsView: FieldsViewState;
  }
  interface KabelEvents {
    /**
     * 字段值变化（任何来源）。
     * @mode emit
     */
    'field:change': { key: string; value: FieldRaw; prev: FieldRaw; source: FieldSource };
    /**
     * 当前字段变化。
     * @mode emit
     */
    'field:focus': { key: string | null };
  }
}

export interface FieldsService {
  groups(): FieldGroup[];
  /** 全部字段（按分组顺序展开） */
  fields(): FieldDefinition[];
  field(key: string): FieldDefinition | undefined;
  get(key: string): FieldValue | undefined;
  /** 纯值快照，用于保存 */
  values(): Record<string, FieldRaw>;
  /** 写入一个字段：按字段类型规整（日期、数字、选项），记录来源与证据 */
  set(key: string, value: unknown, options?: SetFieldOptions): void;
  /** 一次写入多个字段，合并为一条撤销记录；返回实际写入的键 */
  setMany(entries: Record<string, unknown>, options?: SetFieldOptions): string[];
  /** 载入一份档案的字段值（宿主调用，不入撤销栈，清空待复核与错误） */
  load(values: Record<string, unknown>): void;
  confirm(key: string): void;
  confirmAll(): void;
  /** 待复核的字段 */
  pending(): string[];
  focus(key: string | null): void;
  focused(): string | null;
  /** 移动焦点到下一个 / 上一个字段（跳过折叠在“更多字段”中且未展开的不处理，由面板决定） */
  next(): void;
  prev(): void;
  /** 校验必填与正则，结果写入 `state.fieldsView.errors`；返回错误表 */
  validate(): Record<string, string>;
  /** 把任意输入规整为该字段的值（不写入） */
  normalize(key: string, value: unknown): FieldRaw;
}

export const FIELDS_SERVICE = createServiceToken<FieldsService>('kabel.fields');
export const FIELDS_PLUGIN = 'kabel:fields';

/**
 * 字段操作按钮：显示在著录面板字段标签旁（如“框选识别”）。点击执行命令，参数为字段 key。
 */
export interface FieldAction {
  id: string;
  order?: number;
  icon: string;
  title: string;
  command: string;
  when?: (field: FieldDefinition, kernel: Kernel) => boolean;
}

export const FieldExtensions = {
  actions: defineExtensionPoint<FieldAction>('kabel.fields.actions'),
} as const;
