import {
  createArchiveEditor,
  normalizeRecord,
  shallowEqual,
  type ArchiveEditor,
  type ArchiveRecord,
  type EditorOptions,
  type HistoryOptions,
  type IconConfig,
  type ImageSourceInput,
  type InspectorPluginOptions,
  type LayoutOptions,
  type PluginInput,
  type RecordInput,
  type SavePayload,
  type SchemaInput,
  type StorageInput,
  type ValidationResult,
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
 * 档案著录工具 Vue 组件。
 *
 * ```vue
 * <KabelEditor v-model:record="record" :schema="schema" :images="images" @save="onSave" />
 * ```
 *
 * `@save` 的处理函数可以返回 Promise：reject 时保存失败，状态栏给出提示。
 */
export const KabelEditor = defineComponent({
  name: 'KabelEditor',
  props: {
    schema: { type: [Object, Array, String] as PropType<SchemaInput>, default: undefined },
    record: { type: [Object, String] as PropType<RecordInput>, default: undefined },
    images: { type: Array as PropType<readonly ImageSourceInput[]>, default: undefined },
    readonly: { type: Boolean, default: false },
    /** 追加插件（仅在创建时读取；运行期请使用 editor.use） */
    plugins: { type: [Object, Array, Function] as PropType<PluginInput>, default: undefined },
    preset: { type: [Object, Array, Function, Boolean] as PropType<PluginInput | false>, default: undefined },
    layout: { type: Object as PropType<LayoutOptions>, default: undefined },
    metadata: { type: Object as PropType<EditorOptions['metadata']>, default: undefined },
    viewer: { type: [Object, Boolean] as PropType<EditorOptions['viewer']>, default: undefined },
    inspector: { type: [Object, Boolean] as PropType<InspectorPluginOptions | false>, default: undefined },
    instanceId: { type: String, default: undefined },
    storage: { type: [Object, String, Boolean] as PropType<StorageInput>, default: undefined },
    history: { type: Object as PropType<HistoryOptions>, default: undefined },
    icons: { type: Object as PropType<IconConfig>, default: undefined },
    /** 容器高度，默认 100% */
    height: { type: [String, Number], default: '100%' },
    /** 声明为 prop 以便获取返回值：`@save="fn"` 返回的 Promise 会被等待 */
    onSave: { type: Function as PropType<(payload: SavePayload) => unknown>, default: undefined },
  },
  emits: {
    ready: (_editor: ArchiveEditor) => true,
    'update:record': (_record: ArchiveRecord) => true,
    change: (_record: ArchiveRecord) => true,
    saved: (_payload: SavePayload) => true,
    'save-error': (_error: unknown) => true,
    validate: (_result: ValidationResult) => true,
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
        schema: props.schema,
        record: props.record,
        images: props.images,
        readonly: props.readonly,
        plugins: props.plugins,
        preset: props.preset,
        layout: props.layout,
        metadata: props.metadata,
        viewer: props.viewer,
        inspector: props.inspector,
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
          validate: (result) => emit('validate', result),
          'record:change': ({ record }) => {
            emit('update:record', record);
            emit('change', record);
          },
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

    // 宿主 → 编辑器：仅在内容确实变化时同步，避免 v-model 回环
    watch(
      () => props.record,
      (record) => {
        const instance = editor.value;
        if (!instance) return;
        const next = normalizeRecord(record);
        const current = instance.getRecord();
        if (next.id === current.id && shallowEqual(next.values, current.values)) return;
        instance.setRecord(record);
      },
    );
    watch(
      () => props.schema,
      (schema) => schema && editor.value?.setSchema(schema),
    );
    watch(
      () => props.images,
      (images) => editor.value?.setImages(images ?? []),
    );
    watch(
      () => props.readonly,
      (readonly) => editor.value?.setReadonly(readonly),
    );

    const require = () => {
      if (!editor.value) throw new Error('[kabel] editor is not mounted yet');
      return editor.value;
    };
    /** 通过模板 ref 调用的实例方法：`ref<InstanceType<typeof KabelEditor>>()` */
    const api = {
      getEditor: (): ArchiveEditor | null => editor.value,
      save: () => require().save(),
      validate: () => require().validate(),
      undo: () => require().undo(),
      redo: () => require().redo(),
      getRecord: () => require().getRecord(),
      setRecord: (record: RecordInput) => require().setRecord(record),
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
