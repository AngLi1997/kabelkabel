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
  /** 在按钮内显示生效的快捷键（宽屏且显示文字时） */
  showKeybinding?: boolean;
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

/**
 * 横幅：工具栏下方的一行提示（如“智能算法已调用”“影像已锁定”），由状态计算，返回空值时隐藏。
 */
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerItem {
  id: string;
  order?: number;
  tone?: BannerTone | ((state: KabelState) => BannerTone);
  icon?: string;
  text: (state: KabelState, kernel: Kernel) => string | null | undefined | false;
  /** 横幅右侧的操作按钮（执行命令） */
  action?: { label: string; command: string; args?: unknown[] };
}

export interface DrawerViewProps {
  kernel: Kernel;
  drawerId: string;
}

/**
 * 抽屉：工作台最右侧（右侧扩展区域之外）展开的一栏，如日志看板。
 * `when` 为真时显示；窄屏下改为浮层。头部显示标题、`actions` 与关闭按钮（执行 `close`）。
 */
export interface DrawerContribution {
  id: string;
  title: string;
  icon?: string;
  order?: number;
  /** 初始宽度，默认 380 */
  width?: number;
  view: View<DrawerViewProps>;
  when: StatePredicate;
  actions?: PanelAction[];
  /** 关闭抽屉 */
  close: (kernel: Kernel) => unknown;
}

export interface DialogViewProps<P = any> {
  kernel: Kernel;
  dialogId: string;
  /** `DIALOG_SERVICE.open(id, props)` 传入的参数 */
  props: P;
  /** 关闭本弹窗（不检查 `closable`） */
  close: () => void;
}

/**
 * 弹窗：内容由插件贡献，弹窗外框与行为统一由底座（`kabel:feedback`）定义——
 * 遮罩、居中、拖动头部移动（双击复位）、关闭按钮、Esc / 点击遮罩关闭、焦点进入与归还、层叠顺序。
 * 插件只贡献内容视图，经 `DIALOG_SERVICE.open(id, props)` 或命令 `dialog.open` 打开，不自行渲染遮罩与外框。
 * 视图内的操作按钮放在 ui 的 `<DialogFooter>`（或 `.kb-dialog__footer` 元素）中，与底座弹窗样式一致。
 */
export interface DialogContribution<P = any> {
  id: string;
  /** 头部标题，可按参数计算 */
  title: string | ((props: P, state: KabelState) => string);
  /** 宽度（px），默认 480；超出工作台时收缩 */
  width?: number;
  view: View<DialogViewProps<P>>;
  /** 是否允许用户关闭（Esc、遮罩、关闭按钮），如加载中返回 false；默认允许 */
  closable?: (state: KabelState, kernel: Kernel, props: P) => boolean;
  /** 点击遮罩是否关闭，默认 true */
  maskClosable?: boolean;
  /** 弹窗关闭后（任何途径）调用 */
  onClose?: (kernel: Kernel, props: P) => void;
}

/** 内置扩展点 */
export const ExtensionPoints = {
  toolbar: defineExtensionPoint<ToolbarItem>('kabel.toolbar'),
  statusbar: defineExtensionPoint<StatusItem>('kabel.statusbar'),
  panels: defineExtensionPoint<PanelContribution>('kabel.panels'),
  settings: defineExtensionPoint<SettingsPage>('kabel.settings'),
  contextMenu: defineExtensionPoint<ContextMenuItem>('kabel.contextMenu'),
  banners: defineExtensionPoint<BannerItem>('kabel.banners'),
  drawers: defineExtensionPoint<DrawerContribution>('kabel.drawers'),
  dialogs: defineExtensionPoint<DialogContribution>('kabel.dialogs'),
} as const;
