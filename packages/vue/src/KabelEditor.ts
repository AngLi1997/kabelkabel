import {
  createArchiveEditor,
  type ArchiveEditor,
  type ConfirmOptions,
  type EditorOptions,
  type HistoryOptions,
  type IconConfig,
  type ImageSourceInput,
  type LayoutOptions,
  type NotifyOptions,
  type PluginInput,
  type SavePayload,
  type StorageInput,
} from '@kabel/editor';
import {
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowRef,
  watch,
  type PropType,
} from 'vue';
import { KABEL_CONTEXT, VUE_APP_CONTEXT } from './context';

/**
 * 档案工具 Vue 组件：顶部工具栏、左侧扩展面板、内容区、右侧扩展面板、底部状态栏。
 *
 * ```vue
 * <KabelEditor :images="images">
 *   <KabelPanel id="host.info" region="right" title="信息">…</KabelPanel>
 * </KabelEditor>
 * ```
 */
export const KabelEditor = defineComponent({
  name: 'KabelEditor',
  props: {
    readonly: { type: Boolean, default: false },
    /** 保存契约选项；传 false 关闭 */
    save: { type: [Object, Boolean] as PropType<EditorOptions['save']>, default: undefined },
    /** 工作台选项（文件目录、内容面板、缩略图…），传 false 不注册 */
    workspace: { type: [Object, Boolean] as PropType<EditorOptions['workspace']>, default: undefined },
    /** 当前打开的文件，显示在左侧文件目录与内容区域 */
    images: { type: Array as PropType<readonly ImageSourceInput[]>, default: undefined },
    /** 追加插件（仅在创建时读取；运行期请使用 editor.use） */
    plugins: { type: [Object, Array, Function] as PropType<PluginInput>, default: undefined },
    preset: { type: [Object, Array, Function, Boolean] as PropType<PluginInput | false>, default: undefined },
    layout: { type: Object as PropType<LayoutOptions>, default: undefined },
    settings: { type: Boolean as PropType<false>, default: undefined },
    theme: { type: [Object, Boolean] as PropType<EditorOptions['theme']>, default: undefined },
    instanceId: { type: String, default: undefined },
    storage: { type: [Object, String, Boolean] as PropType<StorageInput>, default: undefined },
    history: { type: Object as PropType<HistoryOptions>, default: undefined },
    icons: { type: Object as PropType<IconConfig>, default: undefined },
    /** 声明为 prop 以便获取返回值：`@save="fn"` 返回的 Promise 会被等待，reject 即保存失败 */
    onSave: { type: Function as PropType<(payload: SavePayload) => unknown>, default: undefined },
    /** 容器高度，默认 100% */
    height: { type: [String, Number], default: '100%' },
  },
  emits: {
    ready: (_editor: ArchiveEditor) => true,
    saved: (_payload: SavePayload) => true,
    'save-error': (_error: unknown) => true,
    'readonly-change': (_readonly: boolean) => true,
    'dirty-change': (_dirty: boolean) => true,
    error: (_payload: { error: unknown; source?: string }) => true,
  },
  setup(props, { emit, slots, expose }) {
    const el = shallowRef<HTMLElement | null>(null);
    const editor = shallowRef<ArchiveEditor | null>(null);
    const appContext = getCurrentInstance()?.appContext;
    provide(KABEL_CONTEXT, { editor });

    onMounted(() => {
      const instance = createArchiveEditor(el.value!, {
        images: props.images,
        readonly: props.readonly,
        save: props.save,
        workspace: props.workspace,
        plugins: props.plugins,
        preset: props.preset,
        layout: props.layout,
        settings: props.settings,
        theme: props.theme,
        instanceId: props.instanceId,
        storage: props.storage,
        history: props.history,
        icons: props.icons,
        setup: (kernel) => {
          if (appContext) kernel.services.provide(VUE_APP_CONTEXT, appContext);
        },
        on: {
          save: (payload) => props.onSave?.(payload),
          saved: (payload) => emit('saved', payload),
          'save:error': ({ error }) => emit('save-error', error),
          'mode:change': ({ readonly }) => emit('readonly-change', readonly),
          error: (payload) => emit('error', payload),
        },
      });
      let dirty = instance.isDirty();
      instance.subscribe((state) => {
        if (state.history.dirty === dirty) return;
        dirty = state.history.dirty;
        emit('dirty-change', dirty);
      });
      editor.value = instance;
      instance.ready.then(() => emit('ready', instance));
    });

    onBeforeUnmount(() => {
      editor.value?.destroy();
      editor.value = null;
    });

    // 宿主 → 编辑器
    watch(
      () => props.readonly,
      (readonly) => editor.value?.setReadonly(readonly),
    );
    watch(
      () => props.images,
      (images) => editor.value?.setImages(images ?? []),
    );
    const require = () => {
      if (!editor.value) throw new Error('[kabel] editor is not mounted yet');
      return editor.value;
    };
    /** 通过模板 ref 调用的实例方法：`ref<InstanceType<typeof KabelEditor>>()` */
    const api = {
      getEditor: (): ArchiveEditor | null => editor.value,
      save: () => require().save(),
      setReadonly: (readonly: boolean) => require().setReadonly(readonly),
      notify: (message: string, options?: NotifyOptions) => require().notify(message, options),
      confirm: (options: ConfirmOptions | string) => require().confirm(options),
      undo: () => require().undo(),
      redo: () => require().redo(),
      setImages: (images: readonly ImageSourceInput[]) => require().setImages(images),
      getImages: () => require().getImages(),
      execute: <T = unknown>(command: string, ...args: unknown[]) => require().execute<T>(command, ...args),
      use: (plugin: PluginInput) => require().use(plugin),
      unuse: (name: string) => require().unuse(name),
    };
    expose(api);

    const renderHost = () =>
      h('div', { class: 'kb-vue-host', style: { height: typeof props.height === 'number' ? `${props.height}px` : props.height } }, [
        h('div', { ref: el, class: 'kb-vue-host__mount', style: { height: '100%' } }),
        // 子组件（KabelPanel 等）只负责注册贡献，内容通过 Teleport 渲染到对应区域
        slots.default ? h('div', { style: { display: 'none' } }, slots.default({ editor: editor.value })) : null,
      ]);
    return { ...api, renderHost };
  },
  render() {
    return this.renderHost();
  },
});
