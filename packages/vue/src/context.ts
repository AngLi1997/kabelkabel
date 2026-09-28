import type { ArchiveEditor } from '@kabel/editor';
import { createServiceToken } from '@kabel/editor';
import type { AppContext, InjectionKey, ShallowRef } from 'vue';

export interface KabelVueContext {
  /** 编辑器实例，挂载完成前为 null */
  editor: ShallowRef<ArchiveEditor | null>;
}

export const KABEL_CONTEXT: InjectionKey<KabelVueContext> = Symbol('kabel');

/** 宿主应用的 appContext，vueView 渲染时继承它，使面板内可使用宿主注册的全局组件、指令、插件 */
export const VUE_APP_CONTEXT = createServiceToken<AppContext>('kabel.vue.appContext');
