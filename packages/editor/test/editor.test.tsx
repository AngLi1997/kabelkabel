import { definePlugin, ExtensionPoints } from '@kabel/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchiveEditor, type ArchiveEditor } from '../src';

let editor: ArchiveEditor | undefined;
let el: HTMLElement;

function mount(options: Parameters<typeof createArchiveEditor>[1] = {}) {
  el = document.createElement('div');
  el.style.height = '600px';
  document.body.appendChild(el);
  editor = createArchiveEditor(el, { storage: 'memory', ...options });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  el?.remove();
  editor = undefined;
});

const regions = () => [...el.querySelectorAll('.kb-region')].map((r) => r.getAttribute('data-region'));

describe('createArchiveEditor', () => {
  it('渲染 baseline：工具栏、左侧文件目录、内容区影像、状态栏，右侧无面板时不渲染', async () => {
    mount({ images: [{ url: '/1.jpg', name: '0001.jpg' }, { url: '/2.jpg', name: '0002.jpg' }] });
    await editor!.ready;
    await vi.waitFor(() => expect(editor!.getImages()).toHaveLength(2));
    expect(el.querySelector('.kb-toolbar')).not.toBeNull();
    expect(el.querySelector('.kb-statusbar')).not.toBeNull();
    expect(regions()).toEqual(['left', 'main']);
    const names = [...el.querySelectorAll('[data-region="left"] .kb-files__item')].map((i) => i.textContent);
    expect(names).toEqual(['0001.jpg', '0002.jpg']);
    expect(el.querySelector('[data-region="main"] .kb-stage')).not.toBeNull();
    // 右侧没有面板，对应的开关按钮也不显示
    expect(el.querySelector('button[title^="显示/隐藏右侧面板"]')).toBeNull();
    expect(el.querySelector('button[title^="显示/隐藏左侧面板"]')).not.toBeNull();
  });

  it('点击文件目录中的文件切换内容区影像', async () => {
    mount({ images: ['/1.jpg', '/2.jpg'] });
    await vi.waitFor(() => expect(editor!.getImages()).toHaveLength(2));
    await vi.waitFor(() => expect(el.querySelectorAll('.kb-files__item')).toHaveLength(2));
    el.querySelectorAll<HTMLButtonElement>('.kb-files__item')[1]!.click();
    expect(editor!.getState().documents.index).toBe(1);
  });

  it('右侧为通用扩展区域：任意插件贡献面板后出现，卸载后消失', async () => {
    mount();
    await editor!.ready;
    expect(regions()).toEqual(['left', 'main']);
    await editor!.use(
      definePlugin({
        name: 'host:right',
        setup(ctx) {
          ctx.contribute(ExtensionPoints.panels, { id: 'host.right', region: 'right', title: '宿主面板', view: () => <div class="host-right">x</div> });
        },
      }),
    );
    expect(regions()).toEqual(['left', 'main', 'right']);
    expect(el.querySelector('[data-region="right"] .host-right')).not.toBeNull();
    editor!.unuse('host:right');
    await new Promise((r) => setTimeout(r));
    expect(regions()).toEqual(['left', 'main']);
  });

  it('撤销/重做/dirty 由内核提供，无历史切片时保持干净', () => {
    mount();
    expect(editor!.isDirty()).toBe(false);
    editor!.undo();
    editor!.redo();
    expect(editor!.isDirty()).toBe(false);
  });

  it('保存契约：on(save) 被等待，失败时返回错误并提示', async () => {
    const onSave = vi.fn();
    mount({ on: { save: onSave } });
    await expect(editor!.save()).resolves.toEqual({ ok: true });
    expect(onSave).toHaveBeenCalledWith({ reason: 'manual' });
    editor!.on('save', () => Promise.reject(new Error('失败')));
    const result = await editor!.save();
    expect(result.ok).toBe(false);
    expect(el.querySelector('.kb-toast--error')!.textContent).toContain('保存失败：失败');
  });

  it('只读：初始值、切换与命令禁用', async () => {
    mount({ readonly: true });
    expect(editor!.isReadonly()).toBe(true);
    expect(editor!.kernel.commands.isEnabled('kabel.save')).toBe(false);
    editor!.setReadonly(false);
    expect(editor!.isReadonly()).toBe(false);
    expect(editor!.kernel.commands.isEnabled('kabel.save')).toBe(true);
  });

  it('notify / confirm / setDocuments', async () => {
    mount();
    editor!.notify('你好', { type: 'success', duration: 0 });
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.kb-toast')!.textContent).toContain('你好');
    const asked = editor!.confirm('确定？');
    await new Promise((r) => setTimeout(r));
    el.querySelector<HTMLButtonElement>('.kb-confirm .kb-btn--primary')!.click();
    await expect(asked).resolves.toBe(true);
    editor!.setDocuments([{ id: 'x', name: 'x.pdf', kind: 'pdf', src: '/x.pdf' }]);
    expect(editor!.getCurrentDocument()?.name).toBe('x.pdf');
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

  it('workspace: false 时没有文件目录与影像，只剩空的内容区，宿主 API 安全降级', async () => {
    mount({ workspace: false });
    await editor!.ready;
    expect(regions()).toEqual(['main']);
    expect(el.querySelector('.kb-stage')).toBeNull();
    expect(editor!.getImages()).toEqual([]);
    expect(editor!.getCurrentDocument()).toBeUndefined();
    await expect(editor!.setImages(['/a.jpg'])).resolves.toBeUndefined();
  });

  it('workspace 选项：目录可换位置、可关闭', async () => {
    mount({ workspace: { directory: { region: 'right', title: '文件' } } });
    await editor!.ready;
    expect(regions()).toEqual(['main', 'right']);
    editor!.destroy();
    el.remove();
    mount({ workspace: { directory: false } });
    await editor!.ready;
    expect(regions()).toEqual(['main']);
  });

  it('按选择器挂载，找不到时报错', () => {
    expect(() => createArchiveEditor('#nope')).toThrow(/not found/);
  });
});
