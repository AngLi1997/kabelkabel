export * from './utils';
export * from './event-bus';
export * from './store';
export * from './history';
export * from './commands';
export * from './registry';
export * from './services';
export * from './storage';
export * from './keybinding';
export * from './plugin';
export * from './kernel';
export * from './contributions';
export { historyPlugin } from './history-plugin';
export { modePlugin, modeActions, isReadonly, type ModeState, type ModePluginOptions } from './mode';
export { savePlugin, saveActions, type SaveState, type SaveResult, type SavePluginOptions } from './save';

export * from './feedback';

/** 配置 Schema（cordis 同款 schemastery）：插件 `Config` 声明、校验与默认值 */
export { default as Schema } from 'schemastery';
