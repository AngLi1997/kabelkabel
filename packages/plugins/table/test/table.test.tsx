import { collectFormConfig, collectFormData, ExtensionPoints, modePlugin } from '@kabel/core';
import { createTestKernel, setupPlugins } from '@kabel/core/testing';
import { workspacePlugin } from '@kabel/plugin-workspace';
import { layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE_PLUGIN, TABLE_SERVICE, tablePlugin, pageItems, parseResponse, withQuery, type TableConfig, type TableSubmitResult } from '../src';

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

describe('可编辑', () => {
  const editColumns = [
    { key: 'title', title: '文件题名', required: true },
    { key: 'pages', title: '页数', type: 'number' as const, defaultValue: 1 },
    { key: 'no', title: '编号', editable: false },
  ];
  const editTable = (extra: Partial<TableConfig> = {}): TableConfig => ({
    id: 'm',
    columns: editColumns,
    data: [{ title: 'a', pages: 2, no: 1 }, { title: 'b', pages: 3, no: 2 }],
    editable: true,
    ...extra,
  });

  it('新增 / 修改 / 删除行，修改追踪与事件', async () => {
    const { kernel } = await setupPlugins([tablePlugin({ tables: [editTable()] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    const events: [string, unknown][] = [];
    for (const type of ['table:row-add', 'table:row-remove', 'table:cell-change'] as const) kernel.bus.on(type, (p) => events.push([type, p]));
    expect(service.isEditable('m')).toBe(true);

    const at = service.addRow('m', { title: '新' });
    expect(at).toBe(2);
    expect(service.getState('m')).toMatchObject({ dirty: true, selected: 2, editing: { index: 2, key: 'title' } });
    expect(service.getState('m')!.rows[2]).toEqual({ pages: 1, title: '新' });

    service.updateCell('m', 0, 'title', 'a2');
    service.updateCell('m', 0, 'title', 'a2'); // 值不变不派发
    service.removeRows('m', [1]);
    expect(service.getChanges('m')).toEqual({
      added: [{ pages: 1, title: '新' }],
      updated: [{ index: 0, row: { title: 'a2', pages: 2, no: 1 }, original: { title: 'a', pages: 2, no: 1 } }],
      removed: [{ title: 'b', pages: 3, no: 2 }],
    });
    expect(service.getState('m')!.selected).toBe(1); // 删除后下标随行对象调整
    expect(events.map(([t]) => t)).toEqual(['table:row-add', 'table:cell-change', 'table:row-remove']);
    expect(events[1]![1]).toMatchObject({ index: 0, key: 'title', value: 'a2', oldValue: 'a' });

    // 改回原值后不再算修改
    service.updateCell('m', 0, 'title', 'a');
    expect(service.getChanges('m').updated).toEqual([]);

    expect((await collectFormData(kernel))['table.m']).toMatchObject({ dirty: true, changes: { removed: [{ title: 'b' }] } });
    service.revert('m');
    expect(service.getState('m')).toMatchObject({ dirty: false, rows: editTable().data });
  });

  it('提交：必填校验、onSubmit / table:submit 可否决、成功后清除修改标记', async () => {
    const onSubmit = vi.fn();
    const { kernel } = await setupPlugins([tablePlugin({ tables: [editTable({ onSubmit })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    const errors = vi.fn();
    const submitted = vi.fn();
    kernel.bus.on('table:submit-error', errors);
    kernel.bus.on('table:submitted', submitted);

    service.addRow('m');
    let result = await service.submit('m');
    expect(result).toMatchObject({ ok: false, invalid: [{ index: 2, key: 'title' }] });
    expect(service.getState('m')!.invalid).toEqual([{ index: 2, key: 'title' }]);
    expect(onSubmit).not.toHaveBeenCalled();

    service.updateCell('m', 2, 'title', '补');
    expect(service.getState('m')!.invalid).toEqual([]);
    const off = kernel.bus.on('table:submit', () => Promise.reject(new Error('接口失败')));
    result = await service.submit('m');
    expect(result.ok).toBe(false);
    expect(service.getState('m')).toMatchObject({ dirty: true, submitting: false });
    expect(errors).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'm', error: expect.objectContaining({ message: '接口失败' }) }));

    off();
    result = (await kernel.execute<TableSubmitResult>('table.submit', 'm'))!;
    expect(result).toEqual({ ok: true });
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'm', changes: expect.objectContaining({ added: [{ title: '补', pages: 1 }] }) }));
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(service.getState('m')!.dirty).toBe(false);
    expect(service.getChanges('m').added).toEqual([]);
  });

  it('只读模式与未开启编辑时不可编辑；保存表单后清除修改标记', async () => {
    const { kernel } = await setupPlugins([modePlugin(), tablePlugin({ tables: [editTable(), table({ id: 'ro' })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    expect(service.isEditable('ro')).toBe(false);
    expect(() => service.addRow('ro')).toThrow();
    service.updateCell('m', 0, 'title', 'x');
    kernel.bus.emit('saved', { data: {} } as never);
    expect(service.getState('m')!.dirty).toBe(false);
    await kernel.execute('kabel.setReadonly', true);
    expect(service.isEditable('m')).toBe(false);
    expect(() => service.updateCell('m', 0, 'title', 'y')).toThrow('只读');
  });
});

describe('可多选', () => {
  it('勾选、全选、删除勾选行，派发 table:check', async () => {
    const { kernel } = await setupPlugins([tablePlugin({ tables: [table({ multiple: true, editable: true })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    const onCheck = vi.fn();
    kernel.bus.on('table:check', onCheck);
    service.toggleCheck('materials', 3);
    service.check('materials', [5, 1, 1, 99]);
    expect(service.getState('materials')!.checked).toEqual([1, 5]);
    expect(onCheck).toHaveBeenLastCalledWith({ id: 'materials', indexes: [1, 5], rows: [rows[1], rows[5]] });
    service.checkAll('materials', true, [0, 1, 2]);
    expect(service.getChecked('materials')).toEqual([rows[0], rows[1], rows[2], rows[5]]);
    expect((await collectFormData(kernel))['table.materials']).toMatchObject({ checked: [rows[0], rows[1], rows[2], rows[5]] });

    expect(service.removeRows('materials')).toBe(4); // 不传下标时删除勾选的行
    expect(service.getState('materials')).toMatchObject({ total: 19, checked: [] });
    expect(onCheck).toHaveBeenLastCalledWith({ id: 'materials', indexes: [], rows: [] });
  });

  it('未开启多选时调用报错；update 关闭多选清除勾选', async () => {
    const { kernel } = await setupPlugins([tablePlugin({ tables: [table({ multiple: true }), table({ id: 'single' })] })]);
    const service = kernel.services.get(TABLE_SERVICE);
    expect(() => service.check('single', [0])).toThrow('多选');
    service.check('materials', [0]);
    await service.update('materials', { multiple: false });
    expect(service.getState('materials')!.checked).toEqual([]);
    expect(service.isMultiple('materials')).toBe(false);
  });
});

describe('插件配置', () => {
  it('Config 为默认值，表格显式设置优先；保存配置后重载保留编辑中的数据', async () => {
    const { kernel } = await setupPlugins([tablePlugin({ editable: true, tables: [table(), table({ id: 'fixed', editable: false })] })]);
    let service = kernel.services.get(TABLE_SERVICE);
    expect(kernel.plugins.getConfig(TABLE_PLUGIN)).toEqual({ editable: true, multiple: false });
    expect(service.isEditable('materials')).toBe(true);
    expect(service.isEditable('fixed')).toBe(false);
    service.updateCell('materials', 0, 'title', '改过');

    await kernel.plugins.updateConfig(TABLE_PLUGIN, { editable: true, multiple: true });
    service = kernel.services.get(TABLE_SERVICE);
    expect(service.isMultiple('materials')).toBe(true);
    expect(service.getState('materials')).toMatchObject({ dirty: true });
    expect(service.getState('materials')!.rows[0]!.title).toBe('改过');
    expect(service.getChanges('materials').updated).toHaveLength(1);
    expect((await collectFormConfig(kernel)).table).toMatchObject({ materials: { editable: true, multiple: true }, fixed: { editable: false } });
  });
});

describe('编辑渲染', () => {
  let host: HTMLElement;
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
  });

  it('操作条、双击行内编辑、复选框列', async () => {
    const kernel = createTestKernel({
      plugins: [layoutPlugin({ persist: false }), tablePlugin({ tables: [table({ editable: true, multiple: true, panel: { region: 'left', slot: 'top' } })] })],
    });
    await flush();
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host));
    const service = kernel.services.get(TABLE_SERVICE);
    const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('.kb-dt__bar button')].find((b) => b.textContent?.startsWith(text))!;
    expect(button('提交').disabled).toBe(true);

    const cell = () => host.querySelectorAll<HTMLElement>('.kb-dt__table tbody tr')[0]!.querySelectorAll('td')[2]!;
    act(() => void cell().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = cell().querySelector<HTMLInputElement>('input.kb-dt__editor')!;
    expect(input).toBeTruthy();
    input.value = '改名';
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(service.getState('materials')!.rows[0]!.title).toBe('改名');
    expect(cell().classList.contains('is-changed')).toBe(true);
    expect(button('提交').disabled).toBe(false);

    const box = host.querySelectorAll<HTMLInputElement>('.kb-dt__table tbody input[type="checkbox"]')[1]!;
    act(() => box.click());
    expect(service.getState('materials')!.checked).toEqual([1]);
    expect(button('删除').textContent).toBe('删除（1）');
    act(() => host.querySelector<HTMLInputElement>('.kb-dt__table thead input[type="checkbox"]')!.click());
    expect(service.getState('materials')!.checked).toHaveLength(10);
  });
});
