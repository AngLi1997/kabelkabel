import { createArchiveEditor, type ArchiveEditor } from '@kabel/editor';
import { FIELDS_SERVICE } from '@kabel/plugin-fields';
import { OCR_SERVICE } from '@kabel/plugin-ocr';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LLM_ENDPOINT, DEFAULT_OCR_ENDPOINT, marketSupervisionPreset } from '../src';

let editor: ArchiveEditor | undefined;
let el: HTMLElement;

afterEach(() => {
  editor?.destroy();
  el?.remove();
  editor = undefined;
});

const CHILDREN = ['kabel:fields', 'kabel:catalog', 'kabel:ocr', 'kabel:llm', 'kabel:region-select', 'kabel:ocr-excerpt', 'kabel:layout-extract'];

async function mount() {
  el = document.createElement('div');
  el.style.height = '600px';
  document.body.appendChild(el);
  editor = createArchiveEditor(el, {
    storage: 'memory',
    workspace: { items: [{ id: 'p1', name: '0001.jpg', group: '企业设立登记申请书', kind: 'image', src: '/1.jpg' }] },
    plugins: [marketSupervisionPreset()],
  });
  await editor.ready;
  return editor;
}

describe('marketSupervisionPreset', () => {
  it('注册全部子插件并启用；子插件列在预设之下', async () => {
    const { kernel } = await mount();
    for (const name of CHILDREN) {
      expect(kernel.plugins.status(name), name).toBe('active');
      expect(kernel.plugins.parentOf(name)).toBe('kabel:market-supervision');
    }
    expect(kernel.plugins.getConfig<{ endpoint: string }>('kabel:ocr')!.endpoint).toBe(DEFAULT_OCR_ENDPOINT);
    expect(kernel.plugins.getConfig<{ endpoint: string }>('kabel:llm')!.endpoint).toBe(DEFAULT_LLM_ENDPOINT);
  });

  it('布局：左侧档案详情数据（三组字段）、中间影像、右侧电子文件列表；工具栏有 OCR 框选与版面分析', async () => {
    await mount();
    const left = el.querySelector('[data-region="left"]')!;
    const groups = [...left.querySelectorAll('.kb-catalog .kb-section__title')].map((n) => n.textContent);
    expect(groups).toEqual(['主体信息', '事项信息', '档案信息']);
    expect(left.textContent).toContain('主体名称/姓名');
    expect(el.querySelector('[data-region="right"] .kb-files')).not.toBeNull();
    const labels = [...el.querySelectorAll('.kb-toolbar .kb-btn__label')].map((n) => n.textContent);
    expect(labels.some((l) => l?.startsWith('OCR 框选'))).toBe(true);
    expect(labels.some((l) => l?.startsWith('版面分析'))).toBe(true);
  });

  it('在插件配置中新增字段后，著录面板随之更新，已填写的值保留', async () => {
    const { kernel } = await mount();
    kernel.services.get(FIELDS_SERVICE).set('subjectName', '四川星辰信息技术有限公司');
    const config = kernel.plugins.getConfig<{ groups: { key: string; title: string; fields: unknown[] }[] }>('kabel:fields')!;
    const next = {
      ...config,
      groups: [...config.groups, { key: 'extra', title: '补充信息', collapsed: false, fields: [{ key: 'remark', label: '备注', type: 'textarea' }] }],
    };
    await act(() => kernel.plugins.updateConfig('kabel:fields', next));
    const titles = [...el.querySelectorAll('.kb-catalog .kb-section__title')].map((n) => n.textContent);
    expect(titles).toEqual(['主体信息', '事项信息', '档案信息', '补充信息']);
    expect(kernel.services.get(FIELDS_SERVICE).get('subjectName')!.value).toBe('四川星辰信息技术有限公司');
    expect(kernel.plugins.status('kabel:catalog')).toBe('active');
  });

  it('修改识别服务地址：识别插件重载，依赖它的插件随之重载并拿到新服务', async () => {
    const { kernel } = await mount();
    const before = kernel.services.get(OCR_SERVICE);
    await kernel.plugins.updateConfig('kabel:ocr', { ...kernel.plugins.getConfig<object>('kabel:ocr'), endpoint: 'http://ocr.local/v1' });
    expect(kernel.services.get(OCR_SERVICE)).not.toBe(before);
    expect(kernel.plugins.status('kabel:ocr-excerpt')).toBe('active');
    expect(kernel.plugins.status('kabel:layout-extract')).toBe('active');
  });

  it('停用识别插件：框选识别与版面分析进入等待，按钮消失', async () => {
    const { kernel } = await mount();
    act(() => void kernel.plugins.disable('kabel:ocr'));
    expect(kernel.plugins.status('kabel:ocr-excerpt')).toBe('pending');
    expect(kernel.plugins.status('kabel:layout-extract')).toBe('pending');
    expect(kernel.plugins.blockers('kabel:ocr-excerpt')).toEqual(['kabel.ocr']);
    await act(() => kernel.plugins.enable('kabel:ocr'));
    expect(kernel.plugins.status('kabel:ocr-excerpt')).toBe('active');
  });
});
