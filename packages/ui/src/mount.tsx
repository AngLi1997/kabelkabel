import type { Kernel } from '@kabel/core';
import { render } from 'preact';
import type { IconConfig } from './icons/config';
import { ensureBuiltinSprite, loadIconfontScript } from './icons/sprite';
import { Workbench } from './shell/Workbench';

export interface MountOptions {
  icons?: IconConfig;
  /** 追加到根节点的 className */
  class?: string;
}

/** 将工作台渲染到容器，返回卸载函数 */
export function mountWorkbench(el: HTMLElement, kernel: Kernel, options: MountOptions = {}): () => void {
  const icons = options.icons ?? {};
  if (icons.mode !== 'font') ensureBuiltinSprite(el.ownerDocument);
  if (icons.scriptUrl) loadIconfontScript(icons.scriptUrl, el.ownerDocument);
  render(<Workbench kernel={kernel} ui={{ icons }} class={options.class} />, el);
  return () => render(null, el);
}
