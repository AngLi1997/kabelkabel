import { createServiceToken } from '@kabel/core';
import type { ArchiveRecord, NormalizedSchema, RecordInput, RecordValues, SchemaInput, ValidationResult } from './types';

/** 元数据编辑器对外能力，其他插件与宿主通过 `kernel.services.get(METADATA_SERVICE)` 使用 */
export interface MetadataService {
  getSchema(): NormalizedSchema;
  setSchema(input: SchemaInput): void;
  getRecord(): ArchiveRecord;
  /** 载入档案：重置校验、清空撤销栈并标记为已保存 */
  setRecord(input: RecordInput): void;
  getValue(key: string): unknown;
  /** 以一条历史记录写入单个值 */
  setValue(key: string, value: unknown, label?: string): void;
  /** 以一条历史记录批量写入 */
  setValues(values: RecordValues, label?: string): void;
  setReadonly(readonly: boolean): void;
  validate(): ValidationResult;
  focusField(key: string): void;
}

export const METADATA_SERVICE = createServiceToken<MetadataService>('kabel.metadata');
