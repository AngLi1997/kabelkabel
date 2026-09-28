import { historyPlugin, type PluginInput } from '@kabel/core';
import { inspectorPlugin, type InspectorPluginOptions } from '@kabel/plugin-inspector';
import { metadataPlugin, type MetadataPluginOptions } from '@kabel/plugin-metadata';
import { viewerPlugin, type ViewerPluginOptions } from '@kabel/plugin-viewer';
import { layoutPlugin, type LayoutOptions } from '@kabel/ui';

export interface BaselineOptions {
  layout?: LayoutOptions;
  metadata?: MetadataPluginOptions;
  /** `false` 关闭左侧影像查看 */
  viewer?: ViewerPluginOptions | false;
  /** `false` 关闭右侧辅助面板 */
  inspector?: InspectorPluginOptions | false;
}

/** baseline 预设：布局 + 撤销重做 + 元数据编辑器 + 影像查看 + 辅助面板 */
export function createBaselinePreset(options: BaselineOptions = {}): PluginInput[] {
  return [
    layoutPlugin(options.layout),
    historyPlugin(),
    metadataPlugin(options.metadata),
    options.viewer !== false && viewerPlugin(options.viewer),
    options.inspector !== false && inspectorPlugin(options.inspector || {}),
  ];
}
