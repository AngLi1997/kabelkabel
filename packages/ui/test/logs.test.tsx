import { definePlugin, LOG_SERVICE, type Kernel } from '@kabel/core';
import { createTestKernel, setupPlugins } from '@kabel/core/testing';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportLogs, layoutPlugin, logsPlugin, matchEvent, recorderOf, settingsPlugin, toPlain, Workbench } from '../src';

const demo = () =>
  definePlugin({
    name: 'demo',
    title: '演示',
    setup(ctx) {
      ctx.registerCommand({ id: 'demo.run', title: '演示命令', run: () => ctx.bus.emit('demo:done', { ok: true }) });
      ctx.registerCommand({
        id: 'demo.fail',
        title: '失败命令',
        run: () => {
          throw new Error('boom');
        },
      });
    },
  });

const entries = (kernel: Kernel) => kernel.services.get(LOG_SERVICE).list();

describe('logsPlugin', () => {
  it('记录插件启用、命令执行与插件派发的事件，并标注来源', async () => {
    const { kernel } = await setupPlugins([logsPlugin(), demo()]);
    expect(entries(kernel).some((e) => e.type === 'plugin:registered' && e.source === 'demo')).toBe(true);
    await kernel.execute('demo.run');
    const done = entries(kernel).find((e) => e.type === 'demo:done')!;
    expect(done).toMatchObject({ source: 'demo', level: 'info', payload: { ok: true } });
    const command = entries(kernel).find((e) => e.type === 'command:after')!;
    expect(command).toMatchObject({ source: 'demo', label: '执行命令', message: '演示命令（demo.run）' });
    // command:before 默认不记录
    expect(entries(kernel).some((e) => e.type === 'command:before')).toBe(false);
  });

  it('命令失败记录为错误', async () => {
    const { kernel } = await setupPlugins([logsPlugin(), demo()]);
    await expect(kernel.execute('demo.fail')).rejects.toThrow('boom');
    expect(entries(kernel).find((e) => e.type === 'command:error')).toMatchObject({ level: 'error', source: 'demo', message: '失败命令（demo.fail）：boom' });
    expect(recorderOf(kernel).unseenErrors).toBe(1);
  });

  it('事件规则：自定义名称、级别、不记录与转发为自定义事件', async () => {
    const { kernel } = await setupPlugins([
      logsPlugin({
        rules: [
          { event: 'demo:*', label: '演示完成', level: 'warning', emit: 'host:demo' },
          { event: 'command:*', record: false },
        ],
      }),
      demo(),
    ]);
    const forwarded = vi.fn();
    kernel.bus.on('host:demo', forwarded);
    await kernel.execute('demo.run');
    expect(forwarded).toHaveBeenCalledWith({ ok: true });
    expect(entries(kernel).find((e) => e.type === 'demo:done')).toMatchObject({ label: '演示完成', level: 'warning' });
    // 转发的事件同样被记录，来源保持不变
    expect(entries(kernel).find((e) => e.type === 'host:demo')).toMatchObject({ source: 'demo' });
    expect(entries(kernel).some((e) => e.type.startsWith('command:'))).toBe(false);
  });

  it('保存配置后插件重载，已有日志保留；容量限制最早的日志被丢弃', async () => {
    const { kernel } = await setupPlugins([logsPlugin(), demo()]);
    await kernel.execute('demo.run');
    const before = entries(kernel).length;
    await kernel.plugins.updateConfig('kabel:logs', { capacity: 50 });
    expect(entries(kernel).length).toBeGreaterThanOrEqual(before);
    for (let i = 0; i < 60; i++) kernel.services.get(LOG_SERVICE).log({ message: `第 ${i} 条` });
    expect(entries(kernel)).toHaveLength(50);
    expect(entries(kernel).at(-1)!.message).toBe('第 59 条');
  });

  it('暂停时不记录，清空后为空', async () => {
    const { kernel } = await setupPlugins([logsPlugin(), demo()]);
    await kernel.execute('logs.pause');
    const count = entries(kernel).length;
    await kernel.execute('demo.run');
    expect(entries(kernel)).toHaveLength(count);
    await kernel.execute('logs.pause');
    await kernel.execute('logs.clear');
    // 清空命令本身执行完成后会记录一条
    expect(entries(kernel).every((e) => e.type === 'command:after')).toBe(true);
  });

  it('导出为文本、CSV、JSON', async () => {
    const { kernel } = await setupPlugins([logsPlugin(), demo()]);
    await kernel.execute('demo.run');
    const list = entries(kernel).filter((e) => e.type === 'demo:done');
    const title = (name?: string) => (name === 'demo' ? '演示' : '宿主');
    expect(exportLogs(list, 'text', title)).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[信息\] \[演示\] demo:done \{"ok":true\}$/);
    const csv = exportLogs(list, 'csv', title);
    expect(csv.startsWith('﻿时间,级别,来源')).toBe(true);
    expect(csv).toContain('"{""ok"":true}"');
    expect(JSON.parse(exportLogs(list, 'json', title))[0]).toMatchObject({ type: 'demo:done', sourceTitle: '演示' });
  });
});

describe('recorder helpers', () => {
  it('matchEvent 支持 * 通配', () => {
    expect(matchEvent('region:*', 'region:select')).toBe(true);
    expect(matchEvent('*', 'anything')).toBe(true);
    expect(matchEvent('field:change', 'field:focus')).toBe(false);
  });

  it('toPlain 截断长字符串、处理循环引用与 Error', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(toPlain(cyclic)).toEqual({ a: 1, self: '[Circular]' });
    expect(String(toPlain('x'.repeat(1000)))).toContain('共 1000 字符');
    expect(toPlain(new Error('bad'))).toEqual({ name: 'Error', message: 'bad' });
  });
});

describe('日志看板', () => {
  let host: HTMLElement;
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
  });

  it('状态栏右下角日志按钮展开最右侧看板，关闭按钮收起', async () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin(), logsPlugin(), demo()] });
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host));
    const button = host.querySelector<HTMLElement>('.kb-statusbar .kb-log-status')!;
    expect(button).not.toBeNull();
    expect(host.querySelector('.kb-drawer')).toBeNull();
    act(() => button.click());
    const drawer = host.querySelector('.kb-body > .kb-drawer')!;
    expect(drawer).not.toBeNull();
    // 抽屉位于 body 的最右侧
    expect(drawer.parentElement!.lastElementChild).toBe(drawer);
    await act(() => kernel.execute('demo.run'));
    expect([...host.querySelectorAll('.kb-log__label')].map((el) => el.textContent)).toContain('demo:done');
    act(() => host.querySelector<HTMLElement>('.kb-drawer__header button[title="关闭日志"]')!.click());
    expect(host.querySelector('.kb-drawer')).toBeNull();
  });
});

describe('弹窗拖动', () => {
  let host: HTMLElement;
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
  });

  it('拖动设置弹窗头部移动弹窗，双击复位', () => {
    const kernel = createTestKernel({ plugins: [layoutPlugin(), settingsPlugin()] });
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Workbench kernel={kernel} />, host));
    act(() => void kernel.execute('settings.open'));
    const dialog = host.querySelector<HTMLElement>('.kb-settings__dialog')!;
    const header = host.querySelector<HTMLElement>('.kb-settings__header')!;
    expect(header.classList.contains('kb-drag-handle')).toBe(true);
    // happy-dom 无布局：容器与弹窗尺寸为 0，用模拟矩形给出可移动范围
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() {} }) as DOMRect;
    const box = vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 400, 300));
    vi.spyOn(host.querySelector<HTMLElement>('.kb-settings')!, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 800));
    Object.defineProperty(dialog, 'offsetParent', { value: host.querySelector('.kb-settings') });
    const pointer = (type: string, x: number, y: number) =>
      header.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    act(() => {
      pointer('pointerdown', 200, 110);
    });
    act(() => {
      pointer('pointermove', 250, 140);
    });
    act(() => {
      pointer('pointerup', 250, 140);
    });
    expect(dialog.style.transform).toBe('translate(50px, 30px)');
    box.mockReturnValue(rect(150, 130, 400, 300));
    // 限制在容器内
    act(() => {
      pointer('pointerdown', 250, 140);
    });
    act(() => {
      pointer('pointermove', -2000, -2000);
    });
    act(() => {
      pointer('pointerup', 0, 0);
    });
    expect(dialog.style.transform).toBe('translate(-100px, -100px)');
    act(() => {
      header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(dialog.style.transform).toBe('');
  });
});
