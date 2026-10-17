import { ExtensionPoints, savePlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { field, FIELDS_SERVICE, fieldsPlugin } from '@kabel/plugin-fields';
import { workspacePlugin, WORKSPACE_SERVICE, type DocumentItem } from '@kabel/plugin-workspace';
import { describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DATA_EXCHANGE_SERVICE, dataExchangePlugin, type DataExchangeConfig, type ExchangePayload } from '../src';

const docs: DocumentItem[] = [
  { id: 'a1', name: '申请书-1.jpg', group: '企业设立登记申请书', kind: 'image', src: 'https://oss.example.com/a1.jpg' },
  { id: 'a2', name: '申请书-2.jpg', group: '企业设立登记申请书', kind: 'image', src: 'blob:http://localhost/a2' },
];

const fields = () =>
  fieldsPlugin({
    validateOnSave: false,
    groups: [
      {
        key: 'g',
        title: '主体',
        collapsed: false,
        fields: [field('name', '主体名称', { required: true }), field('date', '批准日期', { type: 'date' }), field('pages', '页数', { type: 'number' })] as never,
      },
    ],
  });

async function setup(config: Partial<DataExchangeConfig> = {}) {
  const ctx = await setupPlugins([workspacePlugin({ items: docs }), fields(), dataExchangePlugin(config)]);
  return { ...ctx, fields: ctx.kernel.services.get(FIELDS_SERVICE), exchange: ctx.kernel.services.get(DATA_EXCHANGE_SERVICE) };
}

describe('dataExchangePlugin', () => {
  it('导出：默认按字段标识放在 fields 下，可序列化为 JSON / YAML', async () => {
    const { fields, exchange } = await setup();
    fields.set('name', '四川星辰信息技术有限公司');
    fields.set('date', '2026年08月11日', { source: 'ai', review: 'pending' });
    const json = exchange.export();
    expect(json).toMatchObject({ format: 'json', mime: 'application/json', filename: 'archive.json' });
    expect(json.data).toEqual({ fields: { name: '四川星辰信息技术有限公司', date: '2026-08-11', pages: null } });
    expect(JSON.parse(json.text)).toEqual(json.data);

    const yaml = exchange.export('yaml');
    expect(yaml.filename).toBe('archive.yaml');
    expect(yaml.text).toContain('name: 四川星辰信息技术有限公司');
    expect(parseYaml(yaml.text)).toEqual(json.data);
  });

  it('字段对照：只交换表中的字段，按嵌套路径输出与读取；数据项可包含复核状态与文件列表', async () => {
    const { fields, exchange } = await setup({
      fieldsPath: '',
      items: ['fields', 'review', 'documents'],
      skipEmpty: true,
      mapping: [
        { field: 'name', path: 'subject.name', submit: true, load: true },
        { field: 'date', path: 'approve_date', submit: true, load: false },
        { field: 'pages', path: '', submit: true, load: true },
      ],
    });
    fields.set('name', '星辰', { source: 'ai', review: 'pending', confidence: 0.9 });
    const { data } = exchange.export();
    expect(data).toEqual({
      subject: { name: '星辰' },
      review: { name: { source: 'ai', review: 'pending', confidence: 0.9 } },
      documents: [
        { id: 'a1', name: '申请书-1.jpg', group: '企业设立登记申请书', url: 'https://oss.example.com/a1.jpg' },
        { id: 'a2', name: '申请书-2.jpg', group: '企业设立登记申请书' },
      ],
    });

    const result = await exchange.load('subject:\n  name: 新名称\napprove_date: 2020-01-01\npages: "12"\n', 'yaml');
    expect(result).toEqual({ fields: 2, documents: 0 });
    expect(fields.values()).toEqual({ name: '新名称', pages: 12 });
    expect(fields.get('name')!.source).toBe('host');
  });

  it('加载数据：向业务层请求，载入字段与文件列表', async () => {
    const { kernel, fields } = await setup({ items: ['fields', 'documents'] });
    const handler = vi.fn(async () => ({
      fields: { name: '四川星辰信息技术有限公司', date: '2026年08月11日', unknown: 'x' },
      documents: [{ name: '营业执照.jpg', group: '营业执照', url: 'https://oss.example.com/license.jpg' }],
    }));
    kernel.bus.on('data-exchange:load', handler);
    await kernel.execute('dataExchange.load');
    expect(handler).toHaveBeenCalledWith({ format: 'json' });
    expect(fields.values()).toEqual({ name: '四川星辰信息技术有限公司', date: '2026-08-11' });
    expect(kernel.services.get(WORKSPACE_SERVICE).getDocuments().map((d) => d.name)).toEqual(['营业执照.jpg']);
    expect(kernel.getState().dataExchange.busy).toBeNull();
  });

  it('业务层可以返回文本', async () => {
    const { kernel, fields } = await setup({ format: 'yaml' });
    kernel.bus.on('data-exchange:load', () => 'fields:\n  name: 固定数据\n');
    await kernel.execute('dataExchange.load');
    expect(fields.get('name')!.value).toBe('固定数据');
  });

  it('提交：校验通过后把导出内容交给业务层；未通过时不提交', async () => {
    const { kernel, fields } = await setup({ format: 'yaml' });
    const submitted: ExchangePayload[] = [];
    kernel.bus.on('data-exchange:submit', async (payload) => void submitted.push(payload));

    await kernel.execute('dataExchange.submit');
    expect(submitted).toHaveLength(0);
    expect(fields.focused()).toBe('name');

    fields.set('name', '星辰');
    await kernel.execute('dataExchange.submit');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ format: 'yaml', data: { fields: { name: '星辰' } } });
    expect(submitted[0]!.text).toContain('name: 星辰');
  });

  it('业务层提交失败时 submit 抛出', async () => {
    const { kernel, fields, exchange } = await setup({ validate: false });
    kernel.bus.on('data-exchange:submit', async () => {
      throw new Error('接口 500');
    });
    fields.set('name', '星辰');
    await expect(exchange.submit()).rejects.toThrow('接口 500');
    await expect(kernel.execute('dataExchange.submit')).resolves.toBeUndefined();
  });

  it('保存时提交：并入保存契约，提交成功才标记已保存', async () => {
    const { kernel, fields } = await setup({ submitOnSave: true });
    await kernel.use(savePlugin({ confirmLeave: false }));
    const submit = vi.fn();
    kernel.bus.on('data-exchange:submit', submit);
    fields.set('name', '星辰');
    expect(kernel.getState().history.dirty).toBe(true);
    await expect(kernel.execute('kabel.save')).resolves.toEqual({ ok: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(kernel.getState().history.dirty).toBe(false);
  });

  it('控件按配置显示', async () => {
    const { toolbar, kernel } = await setup({ controls: ['submit', 'export'] });
    const ids = toolbar()
      .filter((t) => t.id.startsWith('dataExchange.'))
      .map((t) => t.id);
    expect(ids).toEqual(['dataExchange.submit', 'dataExchange.export']);

    await kernel.plugins.updateConfig('kabel:data-exchange', { ...kernel.plugins.getConfig<object>('kabel:data-exchange'), controls: ['load'] });
    expect(
      kernel.extensions
        .get(ExtensionPoints.toolbar)
        .getAll()
        .filter((t) => t.id.startsWith('dataExchange.'))
        .map((t) => t.id),
    ).toEqual(['dataExchange.load']);
  });
});
