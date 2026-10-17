import { setupPlugins } from '@kabel/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseUrl, cleanOcrText, OCR_SERVICE, ocrPlugin } from '../src';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('ocrPlugin', () => {
  it('规整服务地址', () => {
    expect(baseUrl('http://10.20.0.14:8118/v1/models')).toBe('http://10.20.0.14:8118/v1');
    expect(baseUrl('http://h/v1/chat/completions/')).toBe('http://h/v1');
    expect(baseUrl('http://h/v1')).toBe('http://h/v1');
  });

  it('自动选择模型，以多模态消息发送图片与识别指令', async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/models')) return json({ data: [{ id: 'PaddleOCR-VL-0.9B' }] });
      return json({ choices: [{ message: { content: '**四川星辰信息技术有限公司**' } }] });
    });
    vi.stubGlobal('fetch', fetch);
    const { kernel } = await setupPlugins(ocrPlugin({ endpoint: 'http://10.20.0.14:8118/v1/models' }));
    const ocr = kernel.services.get(OCR_SERVICE);
    const result = await ocr.recognize(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    expect(result).toEqual({ text: '四川星辰信息技术有限公司', model: 'PaddleOCR-VL-0.9B' });

    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe('http://10.20.0.14:8118/v1/chat/completions');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('PaddleOCR-VL-0.9B');
    expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,AQID');
    expect(body.messages[0].content[1].text).toBe('OCR:');
  });

  it('整页识别使用 pagePrompt；HTTP 错误抛出', async () => {
    const fetch = vi.fn(async () => new Response('busy', { status: 503, statusText: 'Service Unavailable' }));
    vi.stubGlobal('fetch', fetch);
    const { kernel } = await setupPlugins(ocrPlugin({ model: 'm', pagePrompt: 'Layout:' }));
    await expect(kernel.services.get(OCR_SERVICE).recognize('data:image/png;base64,AA', { task: 'page' })).rejects.toThrow(/503/);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[0].content[1].text).toBe('Layout:');
  });

  it('清理 Markdown 包裹', () => {
    expect(cleanOcrText('```markdown\n# 标题\n正文\n```')).toBe('标题\n正文');
  });
});
