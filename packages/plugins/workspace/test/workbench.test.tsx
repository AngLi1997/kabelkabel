import { definePlugin, ExtensionPoints, historyPlugin } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { contextMenuPlugin, feedbackPlugin, layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKSPACE_SERVICE, WorkspaceExtensions, workspacePlugin, type DocumentItem } from '../src';

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

describe('舞台指针规则', () => {
  // happy-dom 不做布局也不加载图片：固定舞台尺寸，并手动触发图片 load，覆盖层才会渲染
  const loadImage = () => {
    const img = host.querySelector('.kb-stage__image') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 1000 });
    Object.defineProperty(img, 'naturalHeight', { value: 800 });
    // happy-dom 的 img 没有 onload 属性，Preact 会按原样注册 `Load` 事件，两种名字都触发
    act(() => void ['load', 'Load'].forEach((type) => img.dispatchEvent(new Event(type))));
  };
  const stubLayout = () =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600 } as DOMRect);
  afterEach(() => vi.restoreAllMocks());

  const pointer = (el: Element, type: string, init: PointerEventInit) =>
    act(() => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })));
  const drag = (el: Element, button: number, dx = 30) => {
    pointer(el, 'pointerdown', { button, clientX: 0, clientY: 0 });
    pointer(el, 'pointermove', { clientX: dx, clientY: 0 });
    pointer(el, 'pointerup', { clientX: dx, clientY: 0 });
  };
  const moved = () => (host.querySelector('.kb-stage__image') as HTMLElement).style.transform.includes(`translate(30px, 0px)`);
  const canvas = () => host.querySelector('.kb-stage__canvas')!;
  const key = (type: string) => act(() => void window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true })));

  it('无工具：左、右、中键拖动均平移', () => {
    for (const button of [0, 1, 2]) {
      mount();
      drag(canvas(), button);
      expect(moved(), `button ${button}`).toBe(true);
      act(() => render(null, host));
      host.remove();
    }
  });

  it('有工具：左键交给覆盖层，不平移；中键与 空格 + 左键平移', () => {
    stubLayout();
    const seen: string[] = [];
    const kernel = mount(
      definePlugin({
        name: 'tool',
        dependencies: ['kabel:workspace'],
        setup(ctx) {
          ctx.contribute(WorkspaceExtensions.overlays, {
            id: 'tool.overlay',
            tool: 'tool',
            view: () => <div class="tool-layer" onPointerDown={(e) => void seen.push(`down:${e.button}`)} />,
          });
        },
      }),
    );
    loadImage();
    act(() => void kernel.services.get(WORKSPACE_SERVICE).acquireTool('tool'));
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(true);
    expect((canvas() as HTMLElement).style.cursor).toBe('crosshair');

    const layer = host.querySelector('.tool-layer')!;
    drag(layer, 0);
    expect(moved()).toBe(false);
    expect(seen).toEqual(['down:0']);

    // 空格 + 左键：平移，工具收不到该事件
    key('keydown');
    act(() => void canvas().dispatchEvent(new PointerEvent('pointerenter')));
    key('keydown');
    drag(layer, 0);
    expect(moved()).toBe(true);
    expect(seen).toEqual(['down:0']);
    key('keyup');
  });

  it('工具未激活时覆盖层不拦截指针；归还租约后恢复', () => {
    stubLayout();
    const kernel = mount(
      definePlugin({
        name: 'tool',
        dependencies: ['kabel:workspace'],
        setup: (ctx) => ctx.contribute(WorkspaceExtensions.overlays, { id: 'o', tool: 'tool', view: () => <i /> }),
      }),
    );
    loadImage();
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(false);
    let lease!: { dispose(): void };
    act(() => void (lease = kernel.services.get(WORKSPACE_SERVICE).acquireTool('tool')));
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(true);
    act(() => lease.dispose());
    expect(host.querySelector('.kb-stage__overlay')!.classList.contains('is-interactive')).toBe(false);
  });
});
