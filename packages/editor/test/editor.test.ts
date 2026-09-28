import { definePlugin, ExtensionPoints } from '@kabel/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchiveEditor, type ArchiveEditor } from '../src';

const schema = {
  groups: [
    {
      title: '基本信息',
      fields: [
        { key: 'title', label: '题名', required: true },
        { key: 'year', label: '年度', type: 'number' },
      ],
    },
  ],
};

let editor: ArchiveEditor | undefined;
let el: HTMLElement;

function mount(options: Parameters<typeof createArchiveEditor>[1] = {}) {
  el = document.createElement('div');
  el.style.height = '600px';
  document.body.appendChild(el);
  editor = createArchiveEditor(el, { storage: 'memory', schema, ...options });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  el?.remove();
  editor = undefined;
});

describe('createArchiveEditor', () => {
  it('渲染 baseline：中间影像、顶部标记类型、右侧标记列表与著录信息', async () => {
    mount({ record: { title: '关于档案工作的通知' }, images: ['/1.jpg'] });
    await editor!.ready;
    expect(el.querySelector('.kb-toolbar .kb-labelbar')).not.toBeNull();
    expect(el.querySelector('.kb-statusbar')).not.toBeNull();
    expect([...el.querySelectorAll('.kb-region')].map((r) => r.getAttribute('data-region'))).toEqual(['main', 'right']);
    expect(el.querySelector('[data-region="main"] .kb-viewer')).not.toBeNull();
    const tabs = [...el.querySelectorAll('[data-region="right"] .kb-tabs__tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['标记', '著录信息', '校验结果', '操作记录']);
    expect(el.querySelector<HTMLInputElement>('[data-region="right"] .kb-md input')!.value).toBe('关于档案工作的通知');
  });

  it('未传 schema / record 时不启用著录信息，元数据 API 安全降级', async () => {
    el = document.createElement('div');
    document.body.appendChild(el);
    editor = createArchiveEditor(el, { storage: 'memory' });
    await editor.ready;
    expect(editor.kernel.plugins.has('kabel:metadata')).toBe(false);
    expect(editor.kernel.plugins.has('kabel:annotation')).toBe(true);
    expect(editor.getValues()).toEqual({});
    expect(editor.validate().valid).toBe(true);
    expect(editor.getAnnotations()).toEqual({ labels: expect.any(Array), images: [] });
  });

  it('宿主双向通信：on(save) 与 API 调用', async () => {
    const onSave = vi.fn();
    mount({ record: { id: 'R1', values: { title: 'x' } }, on: { save: onSave } });
    editor!.setValue('year', 2024);
    expect(editor!.isDirty()).toBe(true);
    const result = await editor!.save();
    expect(result.ok).toBe(true);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ record: { id: 'R1', values: { title: 'x', year: 2024 } } }));
    expect(editor!.isDirty()).toBe(false);
  });

  it('撤销/重做', () => {
    mount();
    editor!.setValue('title', 'a');
    editor!.setValue('title', 'b');
    editor!.undo();
    expect(editor!.getValues().title).toBe('a');
    editor!.redo();
    expect(editor!.getValues().title).toBe('b');
  });

  it('运行期注册插件：工具栏按钮即时出现，卸载后移除', async () => {
    mount();
    const run = vi.fn();
    await editor!.use(
      definePlugin({
        name: 'host:submit',
        setup(ctx) {
          ctx.registerCommand({ id: 'host.submit', run });
          ctx.contribute(ExtensionPoints.toolbar, { id: 'host.submit', label: '提交审核', icon: 'submit', command: 'host.submit', order: 50 });
        },
      }),
    );
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent === '提交审核');
    expect(button).toBeDefined();
    button!.click();
    expect(run).toHaveBeenCalled();
    editor!.unuse('host:submit');
    await new Promise((r) => setTimeout(r));
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === '提交审核')).toBe(false);
  });

  it('布局 API 与持久化', async () => {
    mount({ storage: 'memory' });
    editor!.layout.collapse('left');
    expect(editor!.getState().layout.collapsed.left).toBe(true);
    editor!.layout.maximize('main');
    expect(editor!.getState().layout.maximized).toBe('main');
    editor!.layout.restore();
    expect(editor!.getState().layout.maximized).toBeNull();
  });

  it('关闭 viewer / inspector 后对应区域不渲染', () => {
    mount({ viewer: false, inspector: false });
    expect([...el.querySelectorAll('.kb-region')].map((r) => r.getAttribute('data-region'))).toEqual(['main', 'right']);
    expect(el.querySelector('.kb-viewer')).toBeNull();
    expect([...el.querySelectorAll('[data-region="right"] .kb-region__title')].map((t) => t.textContent)).toEqual(['著录信息']);
  });

  it('按选择器挂载，找不到时报错', () => {
    expect(() => createArchiveEditor('#nope')).toThrow(/not found/);
  });
});
