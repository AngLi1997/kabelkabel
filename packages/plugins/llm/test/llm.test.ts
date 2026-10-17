import { setupPlugins } from '@kabel/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_SERVICE, llmPlugin, parseJsonObject } from '../src';

afterEach(() => vi.unstubAllGlobals());

describe('llmPlugin', () => {
  it('解析模型输出中的 JSON', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('结果如下：{"a":"x"} 以上')).toEqual({ a: 'x' });
    expect(() => parseJsonObject('无')).toThrow(/JSON/);
  });

  it('按配置调用 chat/completions，json 模式带 response_format', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"星辰"}' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    const { kernel } = await setupPlugins(llmPlugin({ endpoint: 'http://10.20.0.15:8101/v1/models', model: 'qwen', apiKey: 'k', jsonMode: true }));
    const result = await kernel.services.get(LLM_SERVICE).json([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ name: '星辰' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://10.20.0.15:8101/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'qwen', temperature: 0.1, max_tokens: 2048, response_format: { type: 'json_object' } });
  });
});
