import { definePlugin, Schema } from '@kabel/core';
import { LLM_PLUGIN, LLM_SERVICE, type LlmService } from './contract';
import { createOpenAIClient } from './openai';

export interface LlmConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
  timeout: number;
}

export const LlmConfigSchema: Schema<Partial<LlmConfig>, LlmConfig> = Schema.object({
  endpoint: Schema.string().default('http://127.0.0.1:8101/v1').description('服务地址（OpenAI 兼容，/v1 或 /v1/models）'),
  model: Schema.string().default('').description('模型（留空自动选择）'),
  apiKey: Schema.string().role('secret').default('').description('API Key'),
  temperature: Schema.number().min(0).max(2).step(0.1).default(0.1).description('温度'),
  maxTokens: Schema.natural().default(2048).description('最大输出 token'),
  jsonMode: Schema.boolean().default(false).description('JSON 输出模式'),
  timeout: Schema.natural().default(120000).description('超时（毫秒）'),
}) as never;

/** 从模型输出中取出第一个 JSON 对象 */
export function parseJsonObject<T = Record<string, unknown>>(content: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const text = (fenced ? fenced[1]! : content).trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error('模型输出不是有效的 JSON');
  }
}

/**
 * 大模型（能力插件）：通过 OpenAI 兼容接口调用部署的大模型，提供 `LLM_SERVICE`。
 * 服务地址在 设置 › 插件管理 › 大模型 中配置。
 */
export const llmPlugin = (config?: Partial<LlmConfig>) =>
  definePlugin({
    name: LLM_PLUGIN,
    title: '大模型（LLM）',
    Config: LlmConfigSchema,
    config,
    setup(ctx, options) {
      const client = createOpenAIClient(options);
      const service: LlmService = {
        models: () => client.models(),
        chat: (messages, chatOptions = {}) =>
          client.chat({
            messages,
            temperature: chatOptions.temperature ?? options.temperature,
            maxTokens: chatOptions.maxTokens ?? options.maxTokens,
            json: chatOptions.json ?? options.jsonMode,
            signal: chatOptions.signal,
          }),
        async json(messages, chatOptions) {
          const { content } = await service.chat(messages, chatOptions);
          return parseJsonObject(content);
        },
      };
      ctx.provide(LLM_SERVICE, service);
    },
  });
