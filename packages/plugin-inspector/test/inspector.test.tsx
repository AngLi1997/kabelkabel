import { historyPlugin } from '@kabel/core';
import { setupPlugins } from '@kabel/core/testing';
import { METADATA_SERVICE, metadataPlugin } from '@kabel/plugin-metadata';
import { Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { inspectorPlugin } from '../src';

const schema = [{ key: 'title', label: '题名', required: true }];

describe('inspectorPlugin', () => {
  it('缺少元数据插件时拒绝注册', async () => {
    await expect(setupPlugins(inspectorPlugin())).rejects.toThrow(/requires "kabel:metadata"/);
  });

  it('按配置贡献右侧面板', async () => {
    const { panels } = await setupPlugins([metadataPlugin({ schema }), inspectorPlugin({ panels: ['history'] })]);
    expect(panels().filter((p) => p.region === 'right').map((p) => p.id)).toEqual(['inspector.history']);
  });

  it('渲染校验结果与操作记录，并可跳转历史', async () => {
    const { kernel } = await setupPlugins([historyPlugin(), metadataPlugin({ schema }), inspectorPlugin()]);
    const el = document.createElement('div');
    document.body.appendChild(el);
    act(() => render(<Workbench kernel={kernel} />, el));

    const service = kernel.services.get(METADATA_SERVICE);
    act(() => void service.validate());
    expect(el.querySelector('.kb-inspector__issue')?.textContent).toContain('请填写题名');

    act(() => service.setValue('title', '甲', '第一次'));
    act(() => service.setValue('title', '乙', '第二次'));
    const labels = [...el.querySelectorAll('.kb-inspector__entry .kb-inspector__label')].map((n) => n.textContent);
    expect(labels).toEqual(['第二次', '第一次', '初始状态']);
    expect(el.querySelector('.kb-inspector__ok')).not.toBeNull();

    const initial = [...el.querySelectorAll<HTMLButtonElement>('.kb-inspector__entry')].pop()!;
    act(() => initial.click());
    expect(service.getValue('title')).toBeUndefined();
    expect(el.querySelectorAll('.kb-inspector__entry.is-undone')).toHaveLength(2);
    act(() => render(null, el));
  });
});
