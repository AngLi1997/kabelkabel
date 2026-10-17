import { Schema } from '@kabel/core';
import type { ExchangeControl, ExchangeFormat, ExchangeItem } from './contract';

/** 字段对照表的一行：字段模型中的字段 ⇄ 接口数据中的路径 */
export interface ExchangeMapping {
  /** 字段标识（字段模型中的 key） */
  field: string;
  /** 接口字段路径，`a.b` 表示嵌套；留空与字段标识相同 */
  path: string;
  /** 提交时输出 */
  submit: boolean;
  /** 加载时读取 */
  load: boolean;
}

export interface DataExchangeConfig {
  controls: ExchangeControl[];
  format: ExchangeFormat;
  items: ExchangeItem[];
  fieldsPath: string;
  mapping: ExchangeMapping[];
  skipEmpty: boolean;
  validate: boolean;
  submitOnSave: boolean;
  confirmLoad: boolean;
  filename: string;
}

const MappingSchema: Schema<Partial<ExchangeMapping>, ExchangeMapping> = Schema.object({
  field: Schema.string().required().description('字段标识'),
  path: Schema.string().default('').description('接口字段'),
  submit: Schema.boolean().default(true).description('提交'),
  load: Schema.boolean().default(true).description('加载'),
}) as never;

export const DataExchangeConfigSchema: Schema<Partial<DataExchangeConfig>, DataExchangeConfig> = Schema.object({
  controls: Schema.array(
    Schema.union([
      Schema.const('load').description('加载数据'),
      Schema.const('view').description('查看数据'),
      Schema.const('export').description('导出数据'),
    ]),
  )
    .default(['load', 'view', 'export'])
    .description('显示的控件'),
  format: Schema.union([Schema.const('json').description('JSON'), Schema.const('yaml').description('YAML')])
    .default('json')
    .description('数据格式'),
  items: Schema.array(
    Schema.union([
      Schema.const('fields').description('字段值'),
      Schema.const('review').description('来源与复核状态'),
      Schema.const('documents').description('文件列表'),
    ]),
  )
    .default(['fields'])
    .description('数据项'),
  fieldsPath: Schema.string().default('fields').description('字段值路径（留空放在根上）'),
  mapping: Schema.array(MappingSchema).role('table').default([]).description('字段对照（为空时按字段标识交换全部字段）'),
  skipEmpty: Schema.boolean().default(false).description('导出时省略空值'),
  validate: Schema.boolean().default(true).description('业务层导出前校验必填'),
  submitOnSave: Schema.boolean().default(false).description('保存时导出'),
  confirmLoad: Schema.boolean().default(true).description('有未保存修改时加载前确认'),
  filename: Schema.string().default('archive').description('建议的文件名'),
}) as never;
