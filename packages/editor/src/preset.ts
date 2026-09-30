import {
  historyPlugin,
  modePlugin,
  savePlugin,
  type ModePluginOptions,
  type PluginInput,
  type SavePluginOptions,
} from '@kabel/core';
import { workspacePlugin, type WorkspacePluginOptions } from '@kabel/plugin-workspace';
import {
  contextMenuPlugin,
  feedbackPlugin,
  keymapPlugin,
  layoutPlugin,
  palettePlugin,
  settingsPlugin,
  themePlugin,
  type LayoutOptions,
  type ThemeOptions,
} from '@kabel/ui';

export interface BaselineOptions {
  layout?: LayoutOptions;
  /** 初始只读 */
  readonly?: boolean;
  /** 保存契约；`false` 关闭（同时没有 Mod+S、保存按钮与离开确认） */
  save?: SavePluginOptions | false;
  /** 工作台：文档模型、文件目录、内容面板、渲染器与影像舞台；`false` 不注册（自行提供文件与内容） */
  workspace?: WorkspacePluginOptions | false;
  /** `false` 关闭工具栏右侧的设置入口 */
  settings?: false;
  /** `false` 关闭主题插件（仍可通过覆盖 CSS 变量换肤） */
  theme?: ThemeOptions | false;
}

/**
 * baseline 预设（底座）：
 * 布局 · 撤销重做 · 只读模式 · 保存契约 · 消息与对话框 · 快捷键 · 右键菜单 · 命令面板 ·
 * 工作台（左侧文件目录 + 内容区域 + 影像舞台，所有业务插件的底座）· 设置 · 主题。
 *
 * 布局为 顶部工具栏 / 中间（左侧扩展面板 · 内容 · 右侧扩展面板）/ 底部状态栏；
 * 左右两侧不预设用途，区域内没有面板时不渲染。业务功能一律以插件接入。
 */
export function createBaselinePreset(options: BaselineOptions = {}): PluginInput[] {
  const mode: ModePluginOptions = { readonly: options.readonly };
  return [
    layoutPlugin(options.layout),
    historyPlugin(),
    modePlugin(mode),
    options.save !== false && savePlugin(options.save || {}),
    feedbackPlugin(),
    keymapPlugin(),
    contextMenuPlugin(),
    palettePlugin(),
    options.workspace !== false && workspacePlugin(options.workspace),
    options.settings !== false && settingsPlugin(),
    options.theme !== false && themePlugin(options.theme || {}),
  ];
}
