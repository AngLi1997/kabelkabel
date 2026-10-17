import { definePlugin, historyPlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { field, FIELDS_SERVICE, fieldsPlugin } from '@kabel/plugin-fields';
import { OCR_SERVICE, type OcrService } from '@kabel/plugin-ocr';
import { REGION_SERVICE, type RegionSelection, type RegionService } from '@kabel/plugin-region-select';
import { WORKSPACE_SERVICE, workspacePlugin, type DocumentItem } from '@kabel/plugin-workspace';
import { describe, expect, it, vi } from 'vitest';
import { EXCERPT_ORIGIN, ocrExcerptPlugin } from '../src';

const docs: DocumentItem[] = [
  { id: 'p1', name: '0001.jpg', kind: 'image', src: 'p1.jpg' },
  { id: 'p2', name: '0002.jpg', kind: 'image', src: 'p2.jpg' },
];

const fields = fieldsPlugin({
  groups: [{ key: 'g', title: '主体', collapsed: false, fields: [field('name', '名称'), field('date', '批准日期', { type: 'date' })] as never }],
});

function fakes(text = '2026年8月11日') {
  const pick = vi.fn<RegionService['pick']>(async (options) => ({
    id: 'r1',
    origin: options.origin,
    document: docs[0]!,
    image: docs[0],
    original: new Blob(),
    shape: { type: 'rect', x: 10, y: 20, width: 100, height: 30 },
    bbox: { x: 10, y: 20, width: 100, height: 30 },
    crop: { blob: new Blob(['crop']), mime: 'image/png', width: 100, height: 30, bbox: { x: 10, y: 20, width: 100, height: 30 }, localShape: { type: 'rect', x: 0, y: 0, width: 100, height: 30 } },
  }) as unknown as RegionSelection);
  const recognize = vi.fn<OcrService['recognize']>(async () => ({ text, model: 'paddle' }));
  const region = definePlugin({ name: 'fake:region', setup: (ctx) => ctx.provide(REGION_SERVICE, { pick, deactivate: vi.fn() } as unknown as RegionService) });
  const ocr = definePlugin({ name: 'fake:ocr', setup: (ctx) => ctx.provide(OCR_SERVICE, { recognize, models: async () => [] }) });
  return { pick, recognize, region, ocr };
}

describe('ocrExcerptPlugin', () => {
  it('缺少识别服务时等待；服务就绪后启用', async () => {
    const { region, ocr } = fakes();
    const { kernel, toolbar } = await setupPlugins([workspacePlugin({ items: docs }), fields, region, ocrExcerptPlugin()]);
    expect(kernel.plugins.status('kabel:ocr-excerpt')).toBe('pending');
    expect(toolbar().some((t) => t.id === 'excerpt.pick')).toBe(false);
    await kernel.use(ocr);
    expect(kernel.plugins.status('kabel:ocr-excerpt')).toBe('active');
    expect(toolbar().some((t) => t.id === 'excerpt.pick')).toBe(true);
  });

  it('框选 → 识别 → 按字段类型回填，记录证据并跳到下一个字段', async () => {
    const { region, ocr, pick, recognize } = fakes();
    const { kernel } = await setupPlugins([historyPlugin(), workspacePlugin({ items: docs }), fields, region, ocr, ocrExcerptPlugin()]);
    const service = kernel.services.get(FIELDS_SERVICE);
    await kernel.execute('excerpt.pick', 'date');
    expect(pick).toHaveBeenCalledWith({ origin: EXCERPT_ORIGIN, shape: 'rect' });
    expect(recognize).toHaveBeenCalledWith(expect.any(Blob), { task: 'text' });
    expect(service.get('date')).toMatchObject({
      value: '2026-08-11',
      source: 'ocr',
      evidence: { documentId: 'p1', bbox: { x: 10, y: 20, width: 100, height: 30 }, text: '2026年8月11日' },
    });
    expect(kernel.getState().excerpt.phase).toBe('idle');
  });

  it('未指定字段时使用当前字段；没有字段时提示', async () => {
    const { region, ocr } = fakes('四川星辰');
    const { kernel } = await setupPlugins([workspacePlugin({ items: docs }), fields, region, ocr, ocrExcerptPlugin({ autoNext: false })]);
    const service = kernel.services.get(FIELDS_SERVICE);
    service.focus('name');
    await kernel.execute('excerpt.pick');
    expect(service.get('name')!.value).toBe('四川星辰');
    expect(service.focused()).toBe('name');
  });

  it('选中带证据的字段时定位到证据所在页', async () => {
    const { region, ocr } = fakes();
    const { kernel } = await setupPlugins([workspacePlugin({ items: docs }), fields, region, ocr, ocrExcerptPlugin()]);
    const workspace = kernel.services.get(WORKSPACE_SERVICE);
    const service = kernel.services.get(FIELDS_SERVICE);
    service.set('name', 'x', { source: 'ocr', evidence: { documentId: 'p2', bbox: { x: 0, y: 0, width: 1, height: 1 } } });
    const reveal = vi.fn();
    kernel.bus.on('stage:reveal', reveal);
    service.focus('name');
    expect(workspace.current()!.id).toBe('p2');
    expect(reveal).toHaveBeenCalledWith({ documentId: 'p2', bbox: { x: 0, y: 0, width: 1, height: 1 } });
  });
});
