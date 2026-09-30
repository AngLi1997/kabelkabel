/**
 * @kabel/editor —— 主包。
 * 除工厂函数与预设外，同时再导出各子包，宿主只需安装本包即可获得完整类型。
 */
export { createArchiveEditor, type ArchiveEditor, type EditorOptions, type EventListeners } from './editor';
export { createBaselinePreset, type BaselineOptions } from './preset';

export * from '@kabel/core';
export * from '@kabel/ui';
export * from '@kabel/plugin-workspace';
