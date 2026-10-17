import { definePlugin, DIALOG_SERVICE, ExtensionPoints, type DialogViewProps } from '@kabel/core';
import { createTestKernel } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogFooter, feedbackPlugin, layoutPlugin, Workbench } from '../src';

let host: HTMLElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

function Content({ props, close }: DialogViewProps<{ text: string }>) {
  return (
    <>
      <p class="content">{props.text}</p>
      <DialogFooter>
        <button type="button" class="done" onClick={close}>
          完成
        </button>
      </DialogFooter>
    </>
  );
}

function mount(extra: Partial<Parameters<typeof definePlugin>[0]> = {}) {
  const onClose = vi.fn();
  const demo = definePlugin({
    name: 'demo',
    setup(ctx) {
      ctx.contribute(ExtensionPoints.dialogs, {
        id: 'demo.dialog',
        title: (props: { text: string }) => `标题：${props.text}`,
        view: Content,
        onClose,
      });
    },
    ...extra,
  });
  const kernel = createTestKernel({ plugins: [layoutPlugin({ persist: false }), feedbackPlugin(), demo] });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workbench kernel={kernel} />, host));
  return { kernel, dialogs: kernel.services.get(DIALOG_SERVICE), onClose };
}

const $ = (selector: string) => host.querySelector<HTMLElement>(selector);

describe('底座弹窗', () => {
  it('插件经服务打开，底座渲染外框：标题、拖动头部、关闭按钮与 Esc', () => {
    const { kernel, dialogs, onClose } = mount();
    const events: string[] = [];
    kernel.bus.on('dialog:open', ({ id }) => void events.push(`open:${id}`));
    kernel.bus.on('dialog:close', ({ id }) => void events.push(`close:${id}`));

    act(() => dialogs.open('demo.dialog', { text: '甲' }));
    expect($('.kb-dialog__title')?.textContent).toBe('标题：甲');
    expect($('.kb-dialog__header')?.classList.contains('kb-drag-handle')).toBe(true);
    expect($('.kb-dialog .content')?.textContent).toBe('甲');

    act(() => dialogs.update('demo.dialog', { text: '乙' }));
    expect($('.kb-dialog .content')?.textContent).toBe('乙');

    act(() => void $('.kb-dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect($('.kb-dialog')).toBeNull();
    expect(onClose).toHaveBeenCalledWith(kernel, { text: '乙' });
    expect(events).toEqual(['open:demo.dialog', 'close:demo.dialog']);

    act(() => void kernel.execute('dialog.open', 'demo.dialog', { text: '丙' }));
    act(() => $('.kb-dialog .done')!.click());
    expect(dialogs.isOpen('demo.dialog')).toBe(false);
  });

  it('closable 为假时 Esc、遮罩与关闭按钮都不关闭', () => {
    const { kernel, dialogs } = mount();
    kernel.extensions.get(ExtensionPoints.dialogs).add({ id: 'lock', title: '锁定', view: () => null, closable: () => false });
    act(() => dialogs.open('lock'));
    act(() => void $('.kb-dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => void $('.kb-modal')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    expect(($('.kb-dialog__header button') as HTMLButtonElement).disabled).toBe(true);
    expect(dialogs.isOpen('lock')).toBe(true);
    act(() => dialogs.close());
    expect(dialogs.isOpen('lock')).toBe(false);
  });

  it('贡献弹窗的插件停用后自动关闭', () => {
    const { kernel, dialogs } = mount();
    act(() => dialogs.open('demo.dialog', { text: '甲' }));
    act(() => void kernel.plugins.disable('demo'));
    expect(dialogs.isOpen('demo.dialog')).toBe(false);
    expect($('.kb-dialog')).toBeNull();
  });
});
