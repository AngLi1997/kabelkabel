import { ExtensionPoints } from './contributions';
import { createKernel, type Kernel, type KernelOptions } from './kernel';
import type { PluginInput } from './plugin';

/**
 * 插件单测辅助：创建使用内存存储的内核并注册插件。
 *
 * ```ts
 * const { kernel } = await setupPlugins(myPlugin());
 * await kernel.execute('my.command');
 * ```
 */
export function createTestKernel(options: KernelOptions = {}): Kernel {
  return createKernel({ instanceId: 'test', storage: 'memory', ...options });
}

export async function setupPlugins(plugins: PluginInput, options: KernelOptions = {}) {
  const kernel = createTestKernel(options);
  await kernel.use(plugins);
  return {
    kernel,
    toolbar: () => kernel.extensions.get(ExtensionPoints.toolbar).getAll(),
    statusbar: () => kernel.extensions.get(ExtensionPoints.statusbar).getAll(),
    panels: () => kernel.extensions.get(ExtensionPoints.panels).getAll(),
  };
}
