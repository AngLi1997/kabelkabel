import { createServiceToken } from '@kabel/core';

/**
 * 文字识别服务契约。任何识别引擎（PaddleOCR-VL、其他 OCR 服务、本地 WASM）只要提供 `OCR_SERVICE`
 * 即可被框选识别、版面分析等插件使用；同时提供多个时后提供者生效（服务覆盖栈）。
 */
export type OcrTask = 'text' | 'page' | 'table';

export interface OcrOptions {
  /** `text` 区域文字（框选），`page` 整页（版面分析），`table` 表格；默认 `text` */
  task?: OcrTask;
  /** 覆盖配置中的识别指令 */
  prompt?: string;
  signal?: AbortSignal;
}

export interface OcrResult {
  text: string;
  /** 实际使用的模型 */
  model: string;
}

export interface OcrService {
  /** 识别图片：Blob，或可被识别服务访问的 URL / data URL */
  recognize(image: Blob | string, options?: OcrOptions): Promise<OcrResult>;
  /** 列出可用模型（用于连接测试） */
  models(): Promise<string[]>;
}

export const OCR_SERVICE = createServiceToken<OcrService>('kabel.ocr');
export const OCR_PLUGIN = 'kabel:ocr';
