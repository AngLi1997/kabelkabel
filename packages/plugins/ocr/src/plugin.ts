import { definePlugin, Schema } from '@kabel/core';
import { OCR_PLUGIN, OCR_SERVICE, type OcrService, type OcrTask } from './contract';
import { blobToDataUrl, createOpenAIClient } from './openai';
import { toRaster } from './raster';

export interface OcrConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  textPrompt: string;
  pagePrompt: string;
  tablePrompt: string;
  maxTokens: number;
  timeout: number;
}

export const OcrConfigSchema: Schema<Partial<OcrConfig>, OcrConfig> = Schema.object({
  endpoint: Schema.string().default('http://127.0.0.1:8118/v1').description('服务地址（OpenAI 兼容，/v1 或 /v1/models）'),
  model: Schema.string().default('').description('模型（留空自动选择）'),
  apiKey: Schema.string().role('secret').default('').description('API Key'),
  textPrompt: Schema.string().default('OCR:').description('区域识别指令'),
  pagePrompt: Schema.string().default('OCR:').description('整页识别指令'),
  tablePrompt: Schema.string().default('Table Recognition:').description('表格识别指令'),
  maxTokens: Schema.natural().default(4096).description('最大输出 token'),
  timeout: Schema.natural().default(60000).description('超时（毫秒）'),
}) as never;

/** 去掉模型输出中常见的 Markdown 包裹（代码块、强调、标题符号） */
export function cleanOcrText(text: string): string {
  return text
    .replace(/^```[a-z]*\n?|```$/gim, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

/**
 * 文字识别（能力插件）：通过 OpenAI 兼容的多模态接口调用识别模型（默认适配 PaddleOCR-VL 的
 * `OCR:` / `Table Recognition:` 指令），提供 `OCR_SERVICE`。服务地址在 设置 › 插件管理 › 文字识别 中配置。
 */
export const ocrPlugin = (config?: Partial<OcrConfig>) =>
  definePlugin({
    name: OCR_PLUGIN,
    title: '文字识别（OCR）',
    Config: OcrConfigSchema,
    config,
    setup(ctx, options) {
      const client = createOpenAIClient(options);
      const prompts: Record<OcrTask, string> = { text: options.textPrompt, page: options.pagePrompt, table: options.tablePrompt };
      const service: OcrService = {
        models: () => client.models(),
        async recognize(image, recognizeOptions = {}) {
          const url = typeof image === 'string' ? image : await blobToDataUrl(await toRaster(image));
          const prompt = recognizeOptions.prompt ?? prompts[recognizeOptions.task ?? 'text'];
          const { content, model } = await client.chat({
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url } },
                  { type: 'text', text: prompt },
                ],
              },
            ],
            maxTokens: options.maxTokens,
            signal: recognizeOptions.signal,
          });
          return { text: cleanOcrText(content), model };
        },
      };
      ctx.provide(OCR_SERVICE, service);
    },
  });
