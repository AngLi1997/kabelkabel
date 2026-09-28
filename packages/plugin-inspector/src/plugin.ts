import { definePlugin, ExtensionPoints } from '@kabel/core';
import { METADATA_PLUGIN } from '@kabel/plugin-metadata';
import { HistoryPanel } from './HistoryPanel';
import { ValidationPanel } from './ValidationPanel';

export interface InspectorPluginOptions {
  /** 启用的面板，默认全部 */
  panels?: ('validation' | 'history')[];
}

/** 右侧辅助面板：校验结果与操作记录（依赖元数据编辑器插件） */
export const inspectorPlugin = (options: InspectorPluginOptions = {}) =>
  definePlugin({
    name: 'kabel:inspector',
    dependencies: [METADATA_PLUGIN],
    setup(ctx) {
      const enabled = new Set(options.panels ?? ['validation', 'history']);
      if (enabled.has('validation')) {
        ctx.contribute(ExtensionPoints.panels, {
          id: 'inspector.validation',
          region: 'right',
          title: '校验结果',
          order: 10,
          weight: 1,
          view: ValidationPanel,
          actions: [{ id: 'inspector.validate', icon: 'validate', tooltip: '重新校验', command: 'metadata.validate' }],
        });
      }
      if (enabled.has('history')) {
        ctx.contribute(ExtensionPoints.panels, {
          id: 'inspector.history',
          region: 'right',
          title: '操作记录',
          order: 20,
          weight: 1.4,
          view: HistoryPanel,
          actions: [
            { id: 'inspector.undo', icon: 'undo', tooltip: '撤销', command: 'kabel.undo' },
            { id: 'inspector.redo', icon: 'redo', tooltip: '重做', command: 'kabel.redo' },
          ],
        });
      }
    },
  });
