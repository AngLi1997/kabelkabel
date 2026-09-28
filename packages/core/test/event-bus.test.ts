import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src';

describe('EventBus', () => {
  it('on / emit / off', () => {
    const bus = new EventBus<{ persist: { id: string } }>();
    const handler = vi.fn();
    const off = bus.on('persist', handler);
    bus.emit('persist', { id: '1' });
    off();
    bus.emit('persist', { id: '2' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: '1' });
  });

  it('once 只触发一次', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('x', handler);
    bus.emit('x', 1);
    bus.emit('x', 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('处理器异常转发到 error 事件且不中断后续处理器', () => {
    const bus = new EventBus();
    const onError = vi.fn();
    const after = vi.fn();
    bus.on('error', onError);
    bus.on('x', () => {
      throw new Error('boom');
    });
    bus.on('x', after);
    bus.emit('x');
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ source: 'x' }));
  });

  it('emitAsync 依次等待并在 reject 时整体失败', async () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on('persist', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(1);
      return 'a';
    });
    bus.on('persist', () => {
      order.push(2);
      return 'b';
    });
    await expect(bus.emitAsync('persist')).resolves.toEqual(['a', 'b']);
    expect(order).toEqual([1, 2]);
    bus.on('persist', () => Promise.reject(new Error('veto')));
    await expect(bus.emitAsync('persist')).rejects.toThrow('veto');
  });

  it('onAny 接收所有事件', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.onAny(spy);
    bus.emit('a', 1);
    expect(spy).toHaveBeenCalledWith('a', 1);
  });
});
