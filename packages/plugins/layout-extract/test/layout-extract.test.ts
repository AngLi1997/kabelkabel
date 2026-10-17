import { definePlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { field, FIELDS_SERVICE, fieldsPlugin } from '@kabel/plugin-fields';
import { LLM_SERVICE, type LlmService } from '@kabel/plugin-llm';
import { OCR_SERVICE } from '@kabel/plugin-ocr';
import { workspacePlugin, type DocumentItem } from '@kabel/plugin-workspace';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUserPrompt, layoutExtractPlugin } from '../src';

afterEach(() => vi.unstubAllGlobals());

const docs: DocumentItem[] = [
  { id: 'a1', name: '申请书-1.jpg', group: '企业设立登记申请书', kind: 'image', src: 'a1.jpg' },
  { id: 'a2', name: '申请书-2.jpg', group: '企业设立登记申请书', kind: 'image', src: 'a2.jpg' },
  { id: 'b1', name: '章程-1.jpg', group: '公司章程', kind: 'image', src: 'b1.jpg' },
];

const fields = fieldsPlugin({
  groups: [
    {
      key: 'g',
      title: '主体',
      collapsed: false,
      fields: [
        field('name', '主体名称', { hint: '公司名称' }),
        field('type', '主体类型', { type: 'select', options: '有限责任公司,个体工商户' }),
        field('date', '批准日期', { type: 'date' }),
      ] as never,
    },
  ],
});

function setup(result: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['img'], { type: 'image/jpeg' }))));
  const recognize = vi.fn(async () => ({ text: '公司名称：四川星辰信息技术有限公司', model: 'paddle' }));
  const json = vi.fn<LlmService['json']>(async () => result as never);
  const services = definePlugin({
    name: 'fake:ai',
    setup(ctx) {
      ctx.provide(OCR_SERVICE, { recognize, models: async () => [] });
      ctx.provide(LLM_SERVICE, { json, chat: vi.fn(), models: async () => [] } as unknown as LlmService);
    },
  });
  return { recognize, json, services };
}

describe('layoutExtractPlugin', () => {
  it('提示词包含字段清单与各页识别文本', () => {
    const prompt = buildUserPrompt(
      [{ key: 'type', label: '主体类型', type: 'select', options: ['有限责任公司', '个体工商户'], hint: '见申请书' }],
      [{ name: 'p1', text: '正文' }],
    );
    expect(prompt).toContain('- type：主体类型（单选；可选值：有限责任公司 / 个体工商户；提示：见申请书）');
    expect(prompt).toContain('=== 第 1 页：p1 ===\n正文');
  });

  it('按材料项识别各页，模型结果规整后以“AI · 待复核”回填，只覆盖上次 AI 结果', async () => {
    const { recognize, json, services } = setup({ name: '四川星辰信息技术有限公司', type: '有限责任公司（自然人投资或控股）', date: { value: '2026年08月11日' } });
    const { kernel } = await setupPlugins([workspacePlugin({ items: docs }), fields, services, layoutExtractPlugin({ scope: 'group' })]);
    const service = kernel.services.get(FIELDS_SERVICE);
    service.set('name', '人工填写');
    service.set('date', '2020-01-01', { source: 'ai' });

    await kernel.execute('layoutExtract.run');
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(recognize).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ task: 'page' }));
    expect(json.mock.calls[0]![0][1]!.content).toContain('申请书-2.jpg');

    expect(service.get('name')!.value).toBe('人工填写');
    expect(service.get('type')).toMatchObject({ value: '有限责任公司', source: 'ai', review: 'pending' });
    expect(service.get('date')!.value).toBe('2026-08-11');
    expect(kernel.getState().layoutExtract).toMatchObject({ status: 'done', filled: ['type', 'date'] });
  });

  it('识别失败时进入错误状态', async () => {
    const { recognize, services } = setup({});
    recognize.mockRejectedValueOnce(new Error('连接被拒绝'));
    const { kernel } = await setupPlugins([workspacePlugin({ items: docs }), fields, services, layoutExtractPlugin()]);
    await kernel.execute('layoutExtract.run');
    expect(kernel.getState().layoutExtract).toMatchObject({ status: 'error', message: '连接被拒绝' });
  });
});
