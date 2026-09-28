import type { Kernel } from './kernel';
import { defineExtensionPoint } from './registry';
import type { KabelState } from './store';

export type RegionId = 'left' | 'main' | 'right';

/**
 * 视图：渲染层无关的视图描述。
 * - 函数：由内置渲染层（Preact）作为组件渲染；
 * - DomView：自行挂载到容器元素，适用于 Vue/React/原生 DOM 等任意技术栈。
 */
export type View<P = {}> = ((props: P) => unknown) | DomView<P>;

export interface DomView<P = {}> {
  mount(el: HTMLElement, props: P): DomViewInstance<P>;
}

export interface DomViewInstance<P = {}> {
  update?(props: P): void;
  unmount(): void;
}

export const isDomView = <P>(view: View<P>): view is DomView<P> =>
  typeof view === 'object' && view !== null && typeof (view as DomView<P>).mount === 'function';

export type StatePredicate = (state: KabelState, kernel: Kernel) => boolean;

export interface ToolbarItem {
  id: string;
  order?: number;
  /** 所在分组：左侧 start、右侧 end */
  group?: 'start' | 'end';
  type?: 'button' | 'separator' | 'view';
  icon?: string;
  label?: string;
  /** 为 true 时显示文字，否则仅图标 */
  showLabel?: boolean;
  primary?: boolean;
  tooltip?: string;
  /** 点击执行的命令；enabled/checked 状态取自命令定义 */
  command?: string;
  args?: unknown[];
  onClick?: (kernel: Kernel) => unknown;
  when?: StatePredicate;
  view?: View<{ kernel: Kernel }>;
}

export interface StatusItem {
  id: string;
  order?: number;
  align?: 'left' | 'right';
  icon?: string;
  /** 由状态计算的文本；返回空值时隐藏 */
  text?: (state: KabelState, kernel: Kernel) => string | null | undefined | false;
  tone?: (state: KabelState) => 'default' | 'success' | 'warning' | 'danger';
  tooltip?: string;
  command?: string;
  view?: View<{ kernel: Kernel }>;
}

export interface PanelViewProps {
  kernel: Kernel;
  panelId: string;
  region: RegionId;
}

export interface PanelAction {
  id: string;
  icon: string;
  tooltip?: string;
  command?: string;
  args?: unknown[];
  onClick?: (kernel: Kernel) => unknown;
  active?: StatePredicate;
}

export interface PanelContribution {
  id: string;
  region: RegionId;
  title: string;
  icon?: string;
  order?: number;
  view: View<PanelViewProps>;
  /** 显示在区域/面板头部的操作按钮 */
  actions?: PanelAction[];
  /** 堆叠模式下的初始高度权重，默认 1 */
  weight?: number;
  when?: StatePredicate;
}

/** 内置扩展点 */
export const ExtensionPoints = {
  toolbar: defineExtensionPoint<ToolbarItem>('kabel.toolbar'),
  statusbar: defineExtensionPoint<StatusItem>('kabel.statusbar'),
  panels: defineExtensionPoint<PanelContribution>('kabel.panels'),
} as const;
