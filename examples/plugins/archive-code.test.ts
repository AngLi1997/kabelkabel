import { historyPlugin, metadataPlugin } from '@kabel/editor';
import { setupPlugins } from '@kabel/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { archiveCodePlugin, computeArchiveCode } from './archive-code';

const schema = ['fonds', 'year', 'retention', 'itemNo', 'archiveCode'].map((key) => ({ key, label: key }));

describe('computeArchiveCode', () => {
  it('按规则拼接档号', () => {
    expect(computeArchiveCode({ fonds: 'J012', year: 2024, retention: '永久', itemNo: 15 })).toBe('J012-WS·2024-Y-0015');
  });
  it('信息不全时返回 null', () => {
    expect(computeArchiveCode({ fonds: 'J012', year: 2024 })).toBeNull();
  });
});

describe('archiveCodePlugin', () => {
  it('依赖元数据插件', async () => {
    await expect(setupPlugins(archiveCodePlugin())).rejects.toThrow(/requires/);
  });

  it('生成档号：写入字段、可撤销、派发事件', async () => {
    const { kernel, statusbar } = await setupPlugins([
      historyPlugin(),
      metadataPlugin({ schema, record: { fonds: 'J012', year: 2024, retention: '定期30年', itemNo: 3 } }),
      archiveCodePlugin(),
    ]);
    const onGenerated = vi.fn();
    kernel.bus.on('archive-code:generated', onGenerated);
    const status = statusbar().find((s) => s.id === 'archiveCode.pending')!;
    expect(status.text!(kernel.getState(), kernel)).toBe('档号待更新：J012-WS·2024-D30-0003');

    await kernel.execute('archiveCode.generate');
    expect(kernel.getState().record.values.archiveCode).toBe('J012-WS·2024-D30-0003');
    expect(onGenerated).toHaveBeenCalledWith({ code: 'J012-WS·2024-D30-0003' });
    expect(kernel.commands.isEnabled('archiveCode.generate')).toBe(false);
    expect(kernel.getState().history.past.at(-1)!.label).toBe('生成档号');

    await kernel.execute('kabel.undo');
    expect(kernel.getState().record.values.archiveCode).toBeUndefined();
  });
});
