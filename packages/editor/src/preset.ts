import { historyPlugin, type PluginInput } from '@kabel/core';
import { annotationPlugin, type AnnotationPluginOptions } from '@kabel/plugin-annotation';
import { inspectorPlugin, type InspectorPluginOptions } from '@kabel/plugin-inspector';
import { metadataPlugin, type MetadataPluginOptions } from '@kabel/plugin-metadata';
import { viewerPlugin, type ViewerPluginOptions } from '@kabel/plugin-viewer';
import { layoutPlugin, settingsPlugin, themePlugin, type LayoutOptions, type ThemeOptions } from '@kabel/ui';

export interface BaselineOptions {
  layout?: LayoutOptions;
  /** 著录信息（右侧）为可选插件：传入配置时启用 */
  metadata?: MetadataPluginOptions | false;
  /** `false` 关闭影像查看（同时关闭图片标记） */
  viewer?: ViewerPluginOptions | false;
  /** `false` 关闭图片标记 */
  annotation?: AnnotationPluginOptions | false;
  /** 校验结果、操作记录面板，仅在启用著录信息时生效；`false` 关闭 */
  inspector?: InspectorPluginOptions | false;
  /** `false` 关闭工具栏右侧的设置入口 */
  settings?: false;
  /** `false` 关闭主题插件（仍可通过覆盖 CSS 变量换肤） */
  theme?: ThemeOptions | false;
}

/**
 * baseline 预设：布局 + 撤销重做 + 影像查看（中间）+ 图片标记（顶部标记类型、右侧标记列表）+ 设置 + 主题；
 * 传入 metadata 配置时追加著录信息（右侧）与校验结果、操作记录。
 */
export function createBaselinePreset(options: BaselineOptions = {}): PluginInput[] {
  const metadata = options.metadata || null;
  return [
    layoutPlugin(options.layout),
    historyPlugin(),
    options.viewer !== false && viewerPlugin(options.viewer),
    options.viewer !== false && options.annotation !== false && annotationPlugin(options.annotation || {}),
    metadata && metadataPlugin(metadata),
    metadata && options.inspector !== false && inspectorPlugin(options.inspector || {}),
    options.settings !== false && settingsPlugin(),
    options.theme !== false && themePlugin(options.theme || {}),
  ];
}
