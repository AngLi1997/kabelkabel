import { createServiceToken } from '@kabel/core';
import type { FieldSource, FieldValue } from '@kabel/plugin-fields';

/**
 * 数据对接的对外契约：插件只负责“当前数据 ⇄ 指定格式”的转换，读取与持久化由业务层（宿主）完成：
 * - 加载数据：工具栏弹出对话框，按配置格式选择文件或粘贴文本后载入；业务层仍可经 `request()` / `data-exchange:load` 提供数据；
 * - 查看数据：按当前配置序列化并展示，不提交；
 * - 导出数据：工具栏控件把数据导出为 JSON / YAML，经 `data-exchange:submit` 交给业务层，不校验字段；
 *   业务层调用 `submit()` 时按配置校验必填。
 */

export type ExchangeFormat = 'json' | 'yaml';

/** 工具栏控件：加载数据（文件或文本）、查看数据、导出数据（接口提交） */
export type ExchangeControl = 'load' | 'view' | 'export';

/** 数据项：字段值、字段来源与复核状态、文件列表 */
export type ExchangeItem = 'fields' | 'review' | 'documents';

/** 文件列表中的一项（导出时不含 blob: / data: 地址） */
export interface ExchangeDocument {
  id?: string;
  name: string;
  group?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface ExchangeReview {
  source: FieldSource;
  review?: FieldValue['review'];
  confidence?: number;
}

/**
 * 交换数据的结构。字段值按 `fieldsPath` 放置（默认 `fields`，留空则放在根上），
 * 字段键按映射表转换为接口字段（支持 `a.b` 嵌套路径）。
 */
export type ExchangeData = Record<string, unknown> & {
  review?: Record<string, ExchangeReview>;
  documents?: ExchangeDocument[];
};

/** 导出数据时交给业务层的内容 */
export interface ExchangePayload {
  format: ExchangeFormat;
  /** 结构化数据（业务层可直接使用） */
  data: ExchangeData;
  /** 按格式序列化后的文本 */
  text: string;
  mime: string;
  /** 建议的文件名 */
  filename: string;
}

export interface ExchangeLoadResult {
  /** 载入的字段数 */
  fields: number;
  /** 载入的文件数（数据中带文件列表且配置包含文件列表时） */
  documents: number;
}

/** 加载请求：业务层的处理器返回数据（对象或 JSON / YAML 文本），返回 undefined 表示不处理 */
export interface ExchangeLoadRequest {
  format: ExchangeFormat;
}

export type ExchangeInput = ExchangeData | string;

export interface DataExchangeService {
  /** 按配置收集当前数据 */
  collect(): ExchangeData;
  /** 收集并序列化为指定格式（默认取配置） */
  export(format?: ExchangeFormat): ExchangePayload;
  /** 解析 JSON / YAML 文本 */
  parse(text: string, format?: ExchangeFormat): ExchangeData;
  /** 载入数据（对象或文本）：写入字段模型；含文件列表时交给工作台 */
  load(input: ExchangeInput, format?: ExchangeFormat): Promise<ExchangeLoadResult>;
  /** 向业务层请求数据并载入（`data-exchange:load`）；没有业务层响应时返回 null */
  request(): Promise<ExchangeLoadResult | null>;
  /** 校验后导出并交给业务层提交（`data-exchange:submit`）；未通过校验或提交失败时 reject */
  submit(format?: ExchangeFormat): Promise<ExchangePayload>;
}

export const DATA_EXCHANGE_SERVICE = createServiceToken<DataExchangeService>('kabel.dataExchange');
export const DATA_EXCHANGE_PLUGIN = 'kabel:data-exchange';

/** 底座弹窗 id（`ExtensionPoints.dialogs`）：加载数据、查看数据（参数 `{ text }`）；外框与行为由底座定义 */
export const LOADER_DIALOG = 'dataExchange.loader';
export const PREVIEW_DIALOG = 'dataExchange.preview';

declare module '@kabel/core' {
  interface KabelEvents {
    /**
     * 请求加载数据：处理器返回数据（对象或文本，可为 Promise），第一个非空返回值被载入。
     * @mode emitAsync
     */
    'data-exchange:load': ExchangeLoadRequest;
    /**
     * 导出数据：处理器负责提交与持久化，返回的 Promise 被等待，reject 表示导出失败。
     * @mode emitAsync
     */
    'data-exchange:submit': ExchangePayload;
    /**
     * 数据已载入。
     * @mode emit
     */
    'data-exchange:loaded': ExchangeLoadResult;
    /**
     * 数据已提交。
     * @mode emit
     */
    'data-exchange:submitted': ExchangePayload;
  }
}
