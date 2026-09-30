import { createTestKernel } from '@kabel/core/testing';
import { WORKSPACE_SERVICE, workspacePlugin } from '@kabel/plugin-workspace';
import { feedbackPlugin, layoutPlugin, Workbench } from '@kabel/ui';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { fileLoaderPlugin } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('工具栏入口', () => {
  it('打开菜单 → URL 列表对话框 → 加载后关闭并显示到舞台', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false }), feedbackPlugin(), workspacePlugin(), fileLoaderPlugin()] });
    await new Promise((r) => setTimeout(r));
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host));

    const click = (el: Element | null) => act(() => void (el as HTMLElement).click());
    click(host.querySelector('.kb-fl button'));
    const items = [...host.querySelectorAll<HTMLElement>('.kb-fl__menu-item')];
    expect(items.map((i) => i.textContent)).toEqual(['本地目录…', 'MinIO 桶与路径…', 'URL 列表…']);
    await act(async () => items[2]!.click());

    const textarea = host.querySelector('.kb-fl__dialog textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    act(() => {
      textarea.value = 'https://x/1.jpg\nhttps://x/2.jpg';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => (host.querySelector('.kb-fl__footer .kb-btn--primary') as HTMLElement).click());
    await new Promise((r) => setTimeout(r));
    act(() => {});

    expect(kernel.services.get(WORKSPACE_SERVICE).getImages()).toHaveLength(2);
    expect(host.querySelector('.kb-fl__dialog')).toBeNull();
    expect(host.querySelector('.kb-stage__image')?.getAttribute('src')).toBe('https://x/1.jpg');
  });
});
