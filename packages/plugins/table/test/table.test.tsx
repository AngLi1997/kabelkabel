import { collectFormConfig, collectFormData, ExtensionPoints } from '@kabel/core';
import { createTestKernel, setupPlugins } from '@kabel/core/testing';
import { workspacePlugin } from '@kabel/plugin-workspace';
import { layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE_SERVICE, tablePlugin, pageItems, parseResponse, withQuery, type TableConfig } from '../src';

const rows = Array.from({ length: 23 }, (_, i) => ({ no: i + 1, title: `文件${i + 1}`, key: i % 2 === 0 }));
const columns = [
  { key: 'title', title: '文件题名', mark: 'key' },
  { key: 'no', title: '编号', align: 'center' as const },
];
const table = (extra: Partial<TableConfig> = {}): TableConfig => ({ id: 'materials', title: '材料目录', columns, data: rows, ...extra });
const flush = () => new Promise((r) => setTimeout(r));

describe('解析与分页工具', () => {
  it('兼容常见接口返回形态', () => {
    expect(parseResponse([{ a: 1 }])).toEqual({ rows: [{ a: 1 }], total: 1 });
    expect(parseResponse({ list: [{ a: 1 }], total: 9 })).toEqual({ rows: [{ a: 1 }], total: 9 });
    expect(parseResponse({ code: 0, data: { records: [{ a: 1 }, { a: 2 }], total: 30 } })).toEqual({ rows: [{ a: 1 }, { a: 2 }], total: 30 });
    expect(() => parseResponse({ code: 0 })).toThrow();
  });
  it('后端分页参数与页码', () => {
    expect(withQuery('/api/x?type=1#h', { page: 2, pageSize: 10 })).toBe('/api/x?type=1&page=2&pageSize=10#h');
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });
});

describe('表格插件', () => {
  it('默认放在左侧下半区，并作为表单数据提交', async () => {
    const { kernel, panels } = await setupPlugins([workspacePlugin(), tablePlugin({ tables: [table()] })]);
    expect(panels().find((p) => p.id === 'table.materials')).toMatchObject({ region: 'left', slot: 'bottom', title: '材料目录' });
    const service = kernel.services.get(TABLE_SERVICE);
    const onSelect = vi.fn();
    kernel.bus.on('table:select', onSelect);
    service.select('materials', 2);
    expect(onSelect).toHaveBeenCalledWith({ id: 'materials', index: 2, row: rows[2] });
    const data = await collectFormData(kernel);
    expect(data['table.materials']).toEqual({ rows, total: 23, selected: rows[2] });
  });

  it('前端分页：切页与每页条数', async () => {
    const { kernel } = await setupPlugins([workspacePlugin(), tablePlugin({ tables: [table({ pageSize: 10 })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    await service.setPage('materials', 9);
    expect(service.getState('materials')).toMatchObject({ page: 3, pageSize: 10 });
    await service.setPage('materials', 1, 20);
    expect(service.getState('materials')).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('从 URL 加载（后端分页附加参数），只取最后一次请求', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ data: { records: [{ title: url }], total: 42 } }));
    const { kernel } = await setupPlugins([
      workspacePlugin(),
      tablePlugin({ tables: [table({ data: undefined, url: '/api/list', pagination: 'server', fetch: fetchMock })] }),
    ]);
    await flush();
    const service = kernel.services.get(TABLE_SERVICE);
    expect(fetchMock).toHaveBeenCalledWith('/api/list?page=1&pageSize=10', { page: 1, pageSize: 10 });
    expect(service.getState('materials')).toMatchObject({ total: 42, loading: false, rows: [{ title: '/api/list?page=1&pageSize=10' }] });
    await service.setPage('materials', 3);
    expect(service.getState('materials')).toMatchObject({ page: 3, rows: [{ title: '/api/list?page=3&pageSize=10' }] });
    service.setData('materials', [{ title: '本地' }]);
    expect(service.getState('materials')).toMatchObject({ total: 1, url: null });
  });

  it('运行期修改配置：标题、列、分页、数据源', async () => {
    const fetchMock = vi.fn(async () => [{ title: '接口' }]);
    const { kernel, panels } = await setupPlugins([tablePlugin({ tables: [table({ pageSize: 10 })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    const onConfig = vi.fn();
    kernel.bus.on('table:config', onConfig);
    await service.setPage('materials', 2);

    await service.update('materials', { title: '卷内目录', pageSize: 5, columns: [columns[0]!] });
    expect(panels().find((p) => p.id === 'table.materials')?.title).toBe('卷内目录');
    expect(service.getConfig('materials')?.columns).toHaveLength(1);
    expect(service.getState('materials')).toMatchObject({ page: 1, pageSize: 5 });
    expect(onConfig).toHaveBeenCalledWith(expect.objectContaining({ id: 'materials', changed: ['title', 'pageSize', 'columns'] }));

    await kernel.execute('table.update', 'materials', { url: '/api/x', fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { page: 1, pageSize: 5 });
    expect(service.getState('materials')).toMatchObject({ url: '/api/x', rows: [{ title: '接口' }] });

    await service.update('materials', { data: [{ title: 'a' }, { title: 'b' }], submit: false });
    expect(service.getState('materials')).toMatchObject({ total: 2, url: null });
    expect(kernel.extensions.get(ExtensionPoints.formData).getAll().map((p) => p.id)).not.toContain('table.materials');

    const config = (await collectFormConfig(kernel)).table as Record<string, { title: string; data: string }>;
    expect(config.materials).toMatchObject({ title: '卷内目录', data: '[2 行]', url: '/api/x' });
  });

  it('运行期新增与移除表格', async () => {
    const { kernel, panels } = await setupPlugins([workspacePlugin(), tablePlugin()]);
    const service = kernel.services.get(TABLE_SERVICE);
    const events: string[] = [];
    kernel.bus.on('table:add', ({ id }) => events.push(`add:${id}`));
    kernel.bus.on('table:remove', ({ id }) => events.push(`remove:${id}`));
    const remove = service.add(table({ id: 'x', panel: { region: 'right' }, submit: false }));
    expect(panels().find((p) => p.id === 'table.x')?.region).toBe('right');
    expect(kernel.extensions.get(ExtensionPoints.formData).getAll().map((p) => p.id)).not.toContain('table.x');
    remove();
    remove();
    expect(events).toEqual(['add:x', 'remove:x']);
    expect(panels().find((p) => p.id === 'table.x')).toBeUndefined();
    expect(kernel.getState().table.x).toBeUndefined();
  });
});

describe('渲染', () => {
  let host: HTMLElement;
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
  });

  it('左侧上下分区：文件目录在上、表格在下；点击行选中、翻页', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false }), workspacePlugin(), tablePlugin({ tables: [table()] })] });
    await flush();
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host));

    const left = host.querySelector('[data-region="left"]')!;
    expect(left.classList.contains('is-split')).toBe(true);
    expect(left.querySelector('.kb-region__subheader')?.textContent).toContain('材料目录');
    const body = () => [...host.querySelectorAll('.kb-dt__table tbody tr')];
    expect(body()).toHaveLength(10);
    expect(body()[0]!.querySelector('.kb-dt__mark')).toBeTruthy();
    expect(body()[1]!.querySelector('.kb-dt__mark')).toBeNull();

    act(() => (body()[1] as HTMLElement).click());
    expect(body()[1]!.classList.contains('is-selected')).toBe(true);
    await act(async () => (host.querySelector('[title="下一页"]') as HTMLElement).click());
    expect(body()[0]!.textContent).toContain('文件11');
    expect(host.querySelector('.kb-dt__total')?.textContent).toBe('共 23 条');
  });
});
