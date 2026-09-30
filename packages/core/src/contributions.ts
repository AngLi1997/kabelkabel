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

export interface SettingsPageProps {
  kernel: Kernel;
}

/** 设置页中的一个分类页（如插件管理、主题） */
export interface SettingsPage {
  id: string;
  title: string;
  icon?: string;
  order?: number;
  view: View<SettingsPageProps>;
  when?: StatePredicate;
}

export interface ContextMenuContext {
  /** 触发右键菜单的区域标识，来自元素的 `data-kb-context` 属性，如 `document`、`stage` */
  target: string;
  /** 元素的 `data-kb-context-data` 属性，如文件在列表中的下标 */
  data?: string;
}

/** 右键菜单项：按 `target` 匹配区域，同一 `group` 内相邻，组间以分隔线隔开 */
export interface ContextMenuItem {
  id: string;
  order?: number;
  /** 出现在哪些区域的右键菜单中；缺省或 `'*'` 表示所有区域 */
  target?: string | string[];
  group?: string;
  label: string;
  icon?: string;
  /** 执行的命令；enabled 与快捷键提示取自命令定义 */
  command?: string;
  args?: unknown[];
  onClick?: (kernel: Kernel, context: ContextMenuContext) => unknown;
  when?: (state: KabelState, kernel: Kernel, context: ContextMenuContext) => boolean;
}

/** 内置扩展点 */
export const ExtensionPoints = {
  toolbar: defineExtensionPoint<ToolbarItem>('kabel.toolbar'),
  statusbar: defineExtensionPoint<StatusItem>('kabel.statusbar'),
  panels: defineExtensionPoint<PanelContribution>('kabel.panels'),
  settings: defineExtensionPoint<SettingsPage>('kabel.settings'),
  contextMenu: defineExtensionPoint<ContextMenuItem>('kabel.contextMenu'),
} as const;
