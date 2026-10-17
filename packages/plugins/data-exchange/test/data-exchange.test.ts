import { ExtensionPoints, savePlugin, type Kernel } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { field, FIELDS_SERVICE, fieldsPlugin } from '@kabel/plugin-fields';
import { workspacePlugin, WORKSPACE_SERVICE, type DocumentItem } from '@kabel/plugin-workspace';
import { KernelContext } from '@kabel/ui';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
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

  it('业务层加载：request 向业务层要数据并载入', async () => {
    const { kernel, fields, exchange } = await setup({ items: ['fields', 'documents'] });
    const handler = vi.fn(async () => ({
      fields: { name: '四川星辰信息技术有限公司', date: '2026年08月11日', unknown: 'x' },
      documents: [{ name: '营业执照.jpg', group: '营业执照', url: 'https://oss.example.com/license.jpg' }],
    }));
    kernel.bus.on('data-exchange:load', handler);
    await exchange.request();
    expect(handler).toHaveBeenCalledWith({ format: 'json' });
    expect(fields.values()).toEqual({ name: '四川星辰信息技术有限公司', date: '2026-08-11' });
    expect(kernel.services.get(WORKSPACE_SERVICE).getDocuments().map((d) => d.name)).toEqual(['营业执照.jpg']);
    expect(kernel.getState().dataExchange.busy).toBeNull();
  });

  it('业务层可以返回文本', async () => {
    const { kernel, fields, exchange } = await setup({ format: 'yaml' });
    kernel.bus.on('data-exchange:load', () => 'fields:\n  name: 固定数据\n');
    await exchange.request();
    expect(fields.get('name')!.value).toBe('固定数据');
  });

  it('加载数据：弹出对话框，选择文件或粘贴文本后载入，不请求业务层', async () => {
    const { kernel, fields } = await setup();
    const handler = vi.fn();
    kernel.bus.on('data-exchange:load', handler);
    await kernel.execute('dataExchange.load');
    expect(handler).not.toHaveBeenCalled();
    expect(kernel.getState().dataExchange.loader).toBe(true);

    const host = mountControls(kernel);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toContain('.json');
    const file = new File(['{"fields":{"name":"文件数据"}}'], 'archive.json', { type: 'application/json' });
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await file.text();
    });
    expect(host.querySelector('textarea')!.value).toContain('文件数据');

    const apply = [...host.querySelectorAll('.kb-dx__footer button')].find((b) => b.textContent === '加载')!;
    await act(async () => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(fields.get('name')!.value).toBe('文件数据');
    expect(kernel.getState().dataExchange.loader).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    host.remove();

    await kernel.execute('dataExchange.apply', '{"fields":{"name":"手动输入"}}');
    expect(fields.get('name')!.value).toBe('手动输入');
    expect(handler).not.toHaveBeenCalled();
  });

  it('加载对话框按配置只接受 YAML', async () => {
    const { kernel } = await setup({ format: 'yaml' });
    await kernel.execute('dataExchange.load');
    const host = mountControls(kernel);
    expect(host.querySelector<HTMLInputElement>('input[type="file"]')!.accept).toContain('.yaml');
    expect(host.textContent).toContain('选择 YAML 文件');
    host.remove();
  });

  it('导出控件下载文件，不校验、不交给业务层', async () => {
    const { kernel, fields } = await setup({ format: 'yaml', filename: 'archive' });
    const submitted: ExchangePayload[] = [];
    kernel.bus.on('data-exchange:submit', async (payload) => void submitted.push(payload));
    const saved = captureDownloads();

    await kernel.execute('dataExchange.export');
    expect(submitted).toHaveLength(0);
    expect(fields.focused()).toBeNull();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'archive.yaml', type: 'application/yaml' });
    expect(await saved[0]!.blob.text()).toContain('name:');

    fields.set('name', '星辰');
    await kernel.execute('dataExchange.export');
    expect(submitted).toHaveLength(0);
    expect(await saved[1]!.blob.text()).toContain('name: 星辰');
    saved.restore();
  });

  it('业务层 submit：校验未通过时不导出', async () => {
    const { kernel, fields, exchange } = await setup({ format: 'yaml' });
    const submitted: ExchangePayload[] = [];
    kernel.bus.on('data-exchange:submit', async (payload) => void submitted.push(payload));

    await expect(exchange.submit()).rejects.toThrow('有 1 个字段未通过校验');
    expect(submitted).toHaveLength(0);
    expect(fields.focused()).toBe('name');

    fields.set('name', '星辰');
    await exchange.submit();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ format: 'yaml', data: { fields: { name: '星辰' } } });
  });

  it('业务层提交失败时 submit 抛出', async () => {
    const { kernel, fields, exchange } = await setup({ validate: false });
    kernel.bus.on('data-exchange:submit', async () => {
      throw new Error('接口 500');
    });
    fields.set('name', '星辰');
    await expect(exchange.submit()).rejects.toThrow('接口 500');
    const saved = captureDownloads();
    await expect(kernel.execute('dataExchange.export')).resolves.toBeUndefined();
    expect(saved).toHaveLength(1);
    saved.restore();
  });

  it('保存时提交：并入保存契约，提交成功才标记已保存', async () => {
    const { kernel, fields } = await setup({ submitOnSave: true });
    await kernel.use(savePlugin({ confirmLeave: false }));
    const submit = vi.fn();
    kernel.bus.on('data-exchange:submit', submit);
    fields.set('pages', 2);
    expect(kernel.getState().history.dirty).toBe(true);
    await expect(kernel.execute('kabel.save')).resolves.toMatchObject({ ok: false });
    expect(submit).not.toHaveBeenCalled();
    expect(kernel.getState().history.dirty).toBe(true);

    fields.set('name', '星辰');
    await expect(kernel.execute('kabel.save')).resolves.toEqual({ ok: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(kernel.getState().history.dirty).toBe(false);
  });

  it('查看数据：展示当前序列化内容，不提交', async () => {
    const { kernel, fields } = await setup();
    const submit = vi.fn();
    kernel.bus.on('data-exchange:submit', submit);
    fields.set('name', '星辰');
    await kernel.execute('dataExchange.view');
    expect(submit).not.toHaveBeenCalled();
    expect(kernel.getState().dataExchange.preview).toContain('星辰');

    const host = mountControls(kernel);
    expect(host.querySelector('.kb-dx__pre')?.textContent).toContain('星辰');
    act(() => {
      host.querySelector<HTMLButtonElement>('.kb-dx__header button')?.click();
    });
    expect(kernel.getState().dataExchange.preview).toBeNull();
    expect(host.querySelector('.kb-dx__pre')).toBeNull();
    host.remove();
  });

  it('控件按配置顺序显示，且样式一致', async () => {
    const { kernel } = await setup({ controls: ['export', 'load'] });
    const host = mountControls(kernel);
    const buttons = [...host.querySelectorAll('.kb-dx .kb-btn')];
    expect(buttons.map((b) => b.querySelector('.kb-btn__label')?.textContent)).toEqual(['导出数据', '加载数据']);
    expect(buttons.every((b) => b.classList.contains('kb-btn--text') && !b.classList.contains('kb-btn--primary'))).toBe(true);
    host.remove();

    await kernel.plugins.updateConfig('kabel:data-exchange', { ...kernel.plugins.getConfig<object>('kabel:data-exchange'), controls: ['load'] });
    const next = mountControls(kernel);
    expect([...next.querySelectorAll('.kb-btn__label')].map((n) => n.textContent)).toEqual(['加载数据']);
    next.remove();
  });
});

function captureDownloads() {
  const saved: { name: string; type: string; blob: Blob }[] = [];
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    saved.push({ name: '', type: (blob as Blob).type, blob: blob as Blob });
    return 'blob:test';
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const last = saved.at(-1);
    if (last) last.name = this.download;
  });
  return Object.assign(saved, {
    restore() {
      create.mockRestore();
      revoke.mockRestore();
      click.mockRestore();
    },
  });
}

function mountControls(kernel: Kernel): HTMLElement {
  const item = kernel.extensions.get(ExtensionPoints.toolbar).getAll().find((t) => t.id === 'dataExchange.controls');
  if (!item || item.type !== 'view' || typeof item.view !== 'function') throw new Error('缺少数据对接控件');
  const host = document.createElement('div');
  host.className = 'kb-root';
  document.body.appendChild(host);
  act(() => {
    render(h(KernelContext.Provider, { value: kernel, children: h(item.view as never, { kernel }) }), host);
  });
  return host;
}
