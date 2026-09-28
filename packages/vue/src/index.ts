import type { App } from 'vue';
import { KabelEditor } from './KabelEditor';
import { KabelPanel } from './KabelPanel';
import { KabelToolbarButton } from './KabelToolbarButton';

export { KabelEditor, KabelPanel, KabelToolbarButton };
export { vueView } from './vue-view';
export { useKabel, useKabelState } from './composables';
export { KABEL_CONTEXT, VUE_APP_CONTEXT, type KabelVueContext } from './context';

/** 全局注册：`app.use(KabelVue)` */
export const KabelVue = {
  install(app: App) {
    app.component('KabelEditor', KabelEditor);
    app.component('KabelPanel', KabelPanel);
    app.component('KabelToolbarButton', KabelToolbarButton);
  },
};

export * from '@kabel/editor';
