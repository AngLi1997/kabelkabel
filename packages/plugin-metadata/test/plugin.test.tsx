import { historyPlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { METADATA_SERVICE, metadataPlugin, recordActions } from '../src';

const schema = [
  { key: 'title', label: '题名', required: true },
  { key: 'year', label: '年度', type: 'number' },
];

async function setup(options: Parameters<typeof metadataPlugin>[0] = {}) {
  const ctx = await setupPlugins([historyPlugin(), metadataPlugin({ schema, ...options })]);
  return { ...ctx, service: ctx.kernel.services.get(METADATA_SERVICE) };
}

describe('metadataPlugin', () => {
  it('注册面板、工具栏与状态栏贡献', async () => {
    const { panels, toolbar, statusbar } = await setup();
    expect(panels().map((p) => p.id)).toEqual(['metadata.form']);
    expect(toolbar().map((t) => t.id)).toEqual(expect.arrayContaining(['metadata.save', 'metadata.validate']));
    expect(statusbar().map((s) => s.id)).toContain('metadata.required');
  });

  it('编辑可撤销，并派发 record:change', async () => {
    const { kernel, service } = await setup({ record: { title: '原题名' } });
    const onChange = vi.fn();
    kernel.bus.on('record:change', onChange);
    kernel.dispatch(recordActions.setField({ key: 'title', value: '新题名' }, { history: { label: '修改「题名」' } }));
    expect(service.getRecord().values.title).toBe('新题名');
    expect(onChange).toHaveBeenCalledWith({ record: { id: undefined, values: { title: '新题名' } } });
    await kernel.execute('kabel.undo');
    expect(service.getValue('title')).toBe('原题名');
  });

  it('只对已交互字段展示错误，整体校验后展示全部', async () => {
    const { kernel, service } = await setup();
    expect(kernel.getState().metadata.errors).toEqual({});
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(kernel.getState().metadata.errors).toEqual({ title: '请填写题名' });
    service.setValue('title', '已填写');
    expect(kernel.getState().metadata.errors).toEqual({});
  });

  it('保存：校验失败时不触发 save 事件', async () => {
    const { kernel } = await setup();
    const onSave = vi.fn();
    kernel.bus.on('save', onSave);
    const result = await kernel.execute<{ ok: boolean }>('kabel.save');
    expect(result?.ok).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('保存：等待宿主处理并标记为已保存', async () => {
    const { kernel, service } = await setup({ record: { id: 'A1', values: { title: 'x' } } });
    service.setValue('year', 2024);
    expect(kernel.getState().history.dirty).toBe(true);
    const onSave = vi.fn(async () => {});
    kernel.bus.on('save', onSave);
    const result = await kernel.execute<{ ok: boolean }>('kabel.save');
    expect(result?.ok).toBe(true);
    expect(onSave).toHaveBeenCalledWith({ record: { id: 'A1', values: { title: 'x', year: 2024 } }, values: { title: 'x', year: 2024 } });
    expect(kernel.getState().history.dirty).toBe(false);
    expect(kernel.getState().metadata.savedAt).not.toBeNull();
  });

  it('保存：宿主 reject 时记录失败并派发 save:error', async () => {
    const { kernel } = await setup({ record: { title: 'x' } });
    const onError = vi.fn();
    kernel.bus.on('save', () => Promise.reject(new Error('网络异常')));
    kernel.bus.on('save:error', onError);
    await kernel.execute('kabel.save');
    expect(kernel.getState().metadata.saveError).toBe('网络异常');
    expect(onError).toHaveBeenCalled();
  });

  it('setRecord 清空撤销栈', async () => {
    const { kernel, service } = await setup();
    service.setValue('title', 'a');
    service.setRecord({ id: 'B', values: { title: 'b' } });
    expect(kernel.getState().history.canUndo).toBe(false);
    expect(service.getRecord()).toEqual({ id: 'B', values: { title: 'b' } });
  });

  it('setValues 作为一条历史记录', async () => {
    const { kernel, service } = await setup();
    service.setValues({ title: 't', year: 2020 }, '自动填充');
    expect(kernel.getState().history.past.map((e) => e.label)).toEqual(['自动填充']);
  });

  it('只读模式禁用保存', async () => {
    const { kernel } = await setup({ readonly: true });
    expect(kernel.commands.isEnabled('kabel.save')).toBe(false);
  });

  it('卸载插件后状态与服务移除', async () => {
    const { kernel } = await setup();
    kernel.unuse('kabel:metadata');
    expect(kernel.getState().record).toBeUndefined();
    expect(kernel.services.has(METADATA_SERVICE)).toBe(false);
  });
});
