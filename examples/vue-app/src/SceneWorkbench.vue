<script setup lang="ts">
import { KabelEditor, type ArchiveEditor, type SavePayload } from '@kabel/vue';
import { FIELDS_SERVICE } from '@kabel/plugin-fields';
import { computed, ref } from 'vue';
import {
  createScenePlugin,
  loadAddedPlugins,
  loadManagedPlugins,
  saveAddedPlugins,
  saveManagedPlugins,
  scenePlugins,
  type DemoScene,
} from './scenes';
import { connectMarketApi } from './market-api';

const props = defineProps<{ scene: DemoScene }>();
const emit = defineEmits<{ back: [] }>();

const editor = ref<InstanceType<typeof KabelEditor>>();
const ready = ref(false);
const pickerOpen = ref(false);
const pendingId = ref<string | null>(null);
const message = ref('');
const selected = ref<string[]>(initialSelection(props.scene));

const images = props.scene.images();
const initialPlugins = [
  ...props.scene.plugins(),
  ...selected.value.flatMap((id) => {
    const plugin = createScenePlugin(props.scene, id);
    return plugin ? [plugin] : [];
  }),
];

const available = computed(() => scenePlugins(props.scene).filter((item) => !selected.value.includes(item.id)));
const addedPlugins = computed(() => scenePlugins(props.scene).filter((item) => selected.value.includes(item.id)));

function initialSelection(scene: DemoScene): string[] {
  if (scene.catalog) return loadManagedPlugins(scene.id, scene.defaultPluginIds ?? [], scene.catalog.map((item) => item.id));
  return scene.allowAdd ? loadAddedPlugins(scene.id) : [];
}

function persist(ids: string[]) {
  if (props.scene.catalog) saveManagedPlugins(props.scene.id, ids);
  else saveAddedPlugins(props.scene.id, ids);
}

function onReady(instance: ArchiveEditor) {
  // 业务层：数据对接插件只导出 / 载入数据，接口读写在宿主完成
  if (props.scene.id === 'market') connectMarketApi(instance);
  ready.value = true;
}

function openConfig() {
  pickerOpen.value = false;
  void editor.value?.execute('settings.open', 'plugins');
}

async function addPlugin(id: string) {
  const plugin = createScenePlugin(props.scene, id);
  if (!plugin || !editor.value || pendingId.value) return;
  pendingId.value = id;
  message.value = '';
  try {
    await editor.value.use(plugin);
    selected.value = [...selected.value, id];
    persist(selected.value);
  } catch (error) {
    console.error(error);
    message.value = '添加失败';
  } finally {
    pendingId.value = null;
  }
}

function removePlugin(id: string) {
  editor.value?.unuse(id);
  selected.value = selected.value.filter((item) => item !== id);
  persist(selected.value);
}

async function onSave(_payload: SavePayload) {
  if (props.scene.id === 'market') {
    const values = editor.value?.getEditor()?.kernel.services.tryGet(FIELDS_SERVICE)?.values();
    console.info('[host] 保存字段', values);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
</script>

<template>
  <div class="host">
    <div v-if="pickerOpen" class="host-backdrop" @click="pickerOpen = false" />
    <header class="host-bar">
      <button type="button" @click="emit('back')">返回</button>
      <span class="host-bar__title">{{ scene.title }}</span>
      <button v-if="scene.catalog" type="button" :disabled="!ready" @click="pickerOpen = !pickerOpen">插件配置</button>
      <button v-else-if="scene.allowConfig" type="button" :disabled="!ready" @click="openConfig">插件配置</button>
      <button v-if="scene.allowAdd" type="button" :disabled="!ready" @click="pickerOpen = !pickerOpen">添加插件</button>
      <div v-if="pickerOpen" class="host-menu">
        <template v-if="addedPlugins.length">
          <div class="host-menu__section">{{ scene.catalog ? '已启用' : '已添加' }}</div>
          <div v-for="item in addedPlugins" :key="item.id" class="host-menu__row">
            <span>{{ item.title }}</span>
            <span class="host-menu__actions">
              <button v-if="item.configurable" type="button" @click="openConfig()">配置</button>
              <button type="button" @click="removePlugin(item.id)">{{ scene.catalog ? '删除' : '移除' }}</button>
            </span>
          </div>
        </template>
        <p v-else-if="scene.catalog" class="host-menu__message">未启用插件</p>
        <div class="host-menu__section">可添加</div>
        <p v-if="message" class="host-menu__message">{{ message }}</p>
        <p v-if="!available.length" class="host-menu__message">已全部添加</p>
        <div v-for="item in available" :key="item.id" class="host-menu__row">
          <span>{{ item.title }}</span>
          <button type="button" :disabled="pendingId !== null" @click="addPlugin(item.id)">
            {{ pendingId === item.id ? '添加中' : '添加' }}
          </button>
        </div>
      </div>
    </header>
    <main class="host-main">
      <KabelEditor
        ref="editor"
        :instance-id="scene.id"
        :images="images"
        :plugins="initialPlugins"
        :layout="scene.layout"
        @ready="onReady"
        @save="onSave"
        @saved="editor?.notify('已保存', { type: 'success' })"
        @error="({ error }) => console.error(error)"
      />
    </main>
  </div>
</template>
