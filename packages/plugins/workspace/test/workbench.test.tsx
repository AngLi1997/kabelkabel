import { definePlugin, ExtensionPoints, historyPlugin } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { contextMenuPlugin, feedbackPlugin, layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceExtensions, workspacePlugin, type DocumentItem } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const docs: DocumentItem[] = [
  { id: 'a', name: '0001.jpg', group: '正文', kind: 'image', src: '/a.jpg' },
  { id: 'b', name: '0002.jpg', group: '正文', kind: 'image', src: '/b.jpg' },
  { id: 'c', name: '附件.pdf', group: '附件', kind: 'pdf', src: '/c.pdf' },
];

function mount(extra: Parameters<typeof definePlugin>[0] | null = null, workspace = {}) {
  const kernel = createTestKernel({
    plugins: [
      layoutPlugin({ persist: false }),
      historyPlugin(),
      feedbackPlugin(),
      contextMenuPlugin(),
      workspacePlugin({ items: docs, ...workspace }),
      extra,
    ],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return kernel;
}

const click = (el: Element | null) => act(() => void (el as HTMLElement).click());
const names = (selector: string) => [...host.querySelectorAll(selector)].map((e) => e.textContent);

describe('工作台外壳', () => {
  it('左侧文件目录按目录分组，点击切换当前文件；状态栏显示位置', () => {
    const kernel = mount();
    expect(names('.kb-files__folder .kb-files__name')).toEqual(['正文', '附件']);
    click(host.querySelectorAll('.kb-files__item')[2]!);
    expect(kernel.getState().documents.index).toBe(2);
    expect(host.querySelector('.kb-statusbar')!.textContent).toContain('附件 1/1 · 共 3 个');
  });

  it('内容面板按 kind 选择渲染器；没有匹配渲染器时给出提示', () => {
    mount(null, { items: [docs[2]!] });
    expect(host.querySelector('[data-region="main"]')!.textContent).toContain('暂不支持预览此类文件（pdf）');
  });

  it('自定义渲染器接入新的文件类型，并收到当前文件', () => {
    mount(
      definePlugin({
        name: 'pdf',
        setup: (ctx) =>
          ctx.contribute(WorkspaceExtensions.renderers, {
            id: 'pdf.renderer',
            match: (d) => d.kind === 'pdf',
            view: (p: { document: DocumentItem }) => <div class="pdf">{p.document.name}</div>,
          }),
      }),
    );
    expect(host.querySelector('.pdf')).toBeNull();
    click(host.querySelectorAll('.kb-files__item')[2]!);
    expect(host.querySelector('.pdf')!.textContent).toBe('附件.pdf');
  });

  it('同 id 贡献替换内置文件目录（UI 可由插件定义）', () => {
    mount(
      definePlugin({
        name: 'custom-files',
        setup: (ctx) =>
          ctx.contribute(ExtensionPoints.panels, {
            id: 'workspace.files',
            region: 'left',
            title: '我的目录',
            view: () => <div class="my-files">自定义</div>,
          }),
      }),
    );
    expect(host.querySelector('.kb-files')).toBeNull();
    expect(host.querySelector('.my-files')!.textContent).toBe('自定义');
  });

  it('文件目录中右键：打开 / 复制文件名', () => {
    const kernel = mount();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => void host.querySelectorAll('.kb-files__item')[1]!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(names('.kb-contextmenu__label')).toEqual(['打开', '复制文件名']);
    click(host.querySelector('.kb-contextmenu__item'));
    expect(kernel.getState().documents.index).toBe(1);
  });

  it('没有文件时目录与内容都提示暂无文件', () => {
    mount(null, { items: [] });
    expect(host.textContent).toContain('暂无文件');
  });
});
