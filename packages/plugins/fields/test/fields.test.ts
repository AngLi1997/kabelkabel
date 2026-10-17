import { createKernel, historyPlugin, NOTIFY_SERVICE, savePlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { field, FIELDS_SERVICE, fieldsPlugin, normalizeDate, normalizeValue, type FieldsConfig } from '../src';

const config: Partial<FieldsConfig> = {
  groups: [
    {
      key: 'g',
      title: '主体信息',
      collapsed: false,
      fields: [
        field('name', '名称', { required: true }),
        field('date', '日期', { type: 'date' }),
        field('kind', '类型', { type: 'select', options: '有限责任公司,个体工商户' }),
        field('pages', '页数', { type: 'number', more: true }),
      ] as never,
    },
  ],
};

describe('normalize', () => {
  it('日期规整', () => {
    expect(normalizeDate('2026年8月11日')).toBe('2026-08-11');
    expect(normalizeDate('批准日期：2026.08.11')).toBe('2026-08-11');
    expect(normalizeDate('20260811')).toBe('2026-08-11');
    expect(normalizeDate('不详')).toBe('不详');
  });
  it('按类型规整：选项匹配、数字、单行文本去换行', () => {
    expect(normalizeValue({ key: 'k', label: 'k', type: 'select', options: ['有限责任公司', '个体工商户'] }, '类型：有限责任公司（自然人投资）')).toBe('有限责任公司');
    expect(normalizeValue({ key: 'k', label: 'k', type: 'number' }, '共 1,024 页')).toBe(1024);
    expect(normalizeValue({ key: 'k', label: 'k', type: 'text' }, ' 四川星辰\n信息技术有限公司 ')).toBe('四川星辰信息技术有限公司');
    expect(normalizeValue({ key: 'k', label: 'k', type: 'checkbox', options: ['a', 'b'] }, 'a、b、c')).toEqual(['a', 'b']);
  });
});

describe('fieldsPlugin', () => {
  it('配置生成分组与字段；set 记录来源与证据，纳入撤销', async () => {
    const { kernel } = await setupPlugins([historyPlugin(), fieldsPlugin(config)]);
    const fields = kernel.services.get(FIELDS_SERVICE);
    expect(fields.groups()[0]!.fields.map((f) => f.key)).toEqual(['name', 'date', 'kind', 'pages']);
    expect(fields.field('kind')!.options).toEqual(['有限责任公司', '个体工商户']);

    const change = vi.fn();
    kernel.bus.on('field:change', change);
    fields.set('date', '2026年8月11日', { source: 'ocr', evidence: { documentId: 'd1', bbox: { x: 1, y: 2, width: 3, height: 4 } } });
    expect(fields.get('date')).toMatchObject({ value: '2026-08-11', source: 'ocr', evidence: { documentId: 'd1' } });
    expect(change).toHaveBeenCalledWith({ key: 'date', value: '2026-08-11', prev: null, source: 'ocr' });

    await kernel.execute('kabel.undo');
    expect(fields.get('date')).toBeUndefined();
  });

  it('人工输入原样保存并合并为一条撤销记录', async () => {
    const { kernel } = await setupPlugins([historyPlugin(), fieldsPlugin(config)]);
    const fields = kernel.services.get(FIELDS_SERVICE);
    fields.set('name', '四川 ');
    fields.set('name', '四川 星辰');
    expect(fields.get('name')!.value).toBe('四川 星辰');
    expect(kernel.getState().history.past).toHaveLength(1);
  });

  it('setMany 一条撤销记录；复核与确认；焦点导航', async () => {
    const { kernel } = await setupPlugins([historyPlugin(), fieldsPlugin(config)]);
    const fields = kernel.services.get(FIELDS_SERVICE);
    const changed = fields.setMany({ name: '星辰', kind: '个体工商户' }, { source: 'ai', review: 'pending' });
    expect(changed).toEqual(['name', 'kind']);
    expect(kernel.getState().history.past).toHaveLength(1);
    expect(fields.pending()).toEqual(['name', 'kind']);
    fields.confirm('name');
    expect(fields.pending()).toEqual(['kind']);
    await kernel.execute('fields.confirmAll');
    expect(fields.pending()).toEqual([]);

    fields.focus('name');
    fields.next();
    expect(fields.focused()).toBe('date');
    fields.prev();
    fields.prev();
    expect(fields.focused()).toBe('name');
  });

  it('保存前校验必填：未通过时否决保存并定位到第一个错误字段', async () => {
    const kernel = createKernel({ storage: 'memory', plugins: [historyPlugin(), savePlugin({ confirmLeave: false }), fieldsPlugin(config)] });
    kernel.services.provide(NOTIFY_SERVICE, { notify: vi.fn(), confirm: vi.fn() } as never);
    const fields = kernel.services.get(FIELDS_SERVICE);
    const result = await kernel.execute<{ ok: boolean }>('kabel.save');
    expect(result!.ok).toBe(false);
    expect(kernel.getState().fieldsView.errors).toEqual({ name: '名称不能为空' });
    expect(fields.focused()).toBe('name');
    fields.set('name', '星辰');
    expect(kernel.getState().fieldsView.errors).toEqual({});
    expect((await kernel.execute<{ ok: boolean }>('kabel.save'))!.ok).toBe(true);
  });

  it('修改配置后插件重载，已填写的值保留', async () => {
    const { kernel } = await setupPlugins(fieldsPlugin(config));
    kernel.services.get(FIELDS_SERVICE).set('name', '星辰');
    const next = { ...kernel.plugins.getConfig<FieldsConfig>('kabel:fields')! };
    next.groups = [{ ...next.groups[0]!, title: '主体' }];
    await kernel.plugins.updateConfig('kabel:fields', next);
    const fields = kernel.services.get(FIELDS_SERVICE);
    expect(fields.groups()[0]!.title).toBe('主体');
    expect(fields.get('name')!.value).toBe('星辰');
  });

  it('load 载入档案：不入撤销栈', async () => {
    const { kernel } = await setupPlugins([historyPlugin(), fieldsPlugin(config)]);
    const fields = kernel.services.get(FIELDS_SERVICE);
    fields.load({ name: '星辰', date: '2026/8/1' });
    expect(fields.values()).toEqual({ name: '星辰', date: '2026-08-01' });
    expect(kernel.getState().history.past).toHaveLength(0);
  });
});
