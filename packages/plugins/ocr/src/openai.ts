/** OpenAI 兼容接口（/v1/models、/v1/chat/completions）的最小客户端（与 @kabel/plugin-ocr 中的同名文件一致，插件之间不互相 import 实现） */

export interface OpenAIEndpoint {
  /** 服务地址：`http://host:port/v1`，也接受 `/v1/models`、`/v1/chat/completions` 结尾的地址 */
  endpoint: string;
  apiKey?: string;
  /** 模型名称，留空时取 `/models` 返回的第一个 */
  model?: string;
  /** 超时（毫秒），0 不限 */
  timeout?: number;
}

/** 规整服务地址：去掉末尾的 `/models`、`/chat/completions` 与斜杠 */
export function baseUrl(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(models|chat\/completions)$/, '');
}

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export function createOpenAIClient(options: OpenAIEndpoint) {
  const base = baseUrl(options.endpoint);
  let resolved: string | null = options.model || null;

  const request = async (path: string, init: RequestInit & { signal?: AbortSignal | null }) => {
    const controller = new AbortController();
    const timer = options.timeout ? setTimeout(() => controller.abort(new Error('请求超时')), options.timeout) : undefined;
    const abort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', abort);
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`${response.status} ${response.statusText}${detail ? `：${detail.slice(0, 200)}` : ''}`);
      }
      return response.json();
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    }
  };

  const models = async (): Promise<string[]> => {
    const body = (await request('/models', { method: 'GET' })) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id);
  };

  const model = async (): Promise<string> => {
    if (resolved) return resolved;
    const list = await models();
    if (!list.length) throw new Error(`${base}/models 没有可用模型`);
    resolved = list[0]!;
    return resolved;
  };

  const chat = async (req: ChatRequest): Promise<{ content: string; model: string }> => {
    const name = await model();
    const body = (await request('/chat/completions', {
      method: 'POST',
      signal: req.signal,
      body: JSON.stringify({
        model: name,
        messages: req.messages,
        temperature: req.temperature ?? 0,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })) as { choices?: { message?: { content?: string } }[] };
    return { content: body.choices?.[0]?.message?.content ?? '', model: name };
  };

  return { base, models, model, chat };
}

/** Blob → data URL（不依赖 FileReader，Node / 浏览器通用） */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}
