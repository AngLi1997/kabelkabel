import { createServiceToken } from '@kabel/core';
import type { ChatMessage } from './openai';

export type { ChatMessage, ChatContentPart } from './openai';

/**
 * 大模型服务契约：结构化提取、摘要、校对等插件只依赖 `LLM_SERVICE`，不关心模型部署在哪里。
 */
export interface LlmChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** 要求模型输出 JSON 对象（服务端支持 `response_format` 时启用） */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LlmService {
  chat(messages: ChatMessage[], options?: LlmChatOptions): Promise<{ content: string; model: string }>;
  /** 调用模型并解析输出中的 JSON 对象（容忍 ```json 代码块与前后说明文字） */
  json<T = Record<string, unknown>>(messages: ChatMessage[], options?: LlmChatOptions): Promise<T>;
  models(): Promise<string[]>;
}

export const LLM_SERVICE = createServiceToken<LlmService>('kabel.llm');
export const LLM_PLUGIN = 'kabel:llm';
