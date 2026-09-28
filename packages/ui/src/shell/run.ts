import type { Kernel } from '@kabel/core';

/** 执行命令或回调，异常统一转发到 error 事件 */
export function runAction(kernel: Kernel, item: { command?: string; args?: unknown[]; onClick?: (k: Kernel) => unknown }) {
  const report = (error: unknown) => kernel.bus.emit('error', { error, source: item.command ?? 'action' });
  try {
    const result = item.onClick ? item.onClick(kernel) : item.command ? kernel.execute(item.command, ...(item.args ?? [])) : undefined;
    if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(report);
  } catch (error) {
    report(error);
  }
}
