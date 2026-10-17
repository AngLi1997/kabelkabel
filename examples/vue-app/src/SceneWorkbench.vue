<script setup lang="ts">
import { KabelEditor, type ArchiveEditor, type SavePayload } from '@kabel/vue';
import { FIELDS_SERVICE } from '@kabel/plugin-fields';
import { computed, ref } from 'vue';
import {
  createDemoPlugin,
  demoPlugins,
  loadAddedPlugins,
  saveAddedPlugins,
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
const added = ref<string[]>(props.scene.allowAdd ? loadAddedPlugins(props.scene.id) : []);

const images = props.scene.images();
const initialPlugins = [
  ...props.scene.plugins(),
  ...added.value.flatMap((id) => {
    const plugin = createDemoPlugin(id);
    return plugin ? [plugin] : [];
  }),
];

const available = computed(() => demoPlugins.filter((item) => !added.value.includes(item.id)));
const addedPlugins = computed(() => demoPlugins.filter((item) => added.value.includes(item.id)));

function onReady(instance: ArchiveEditor) {
  // 业务层：数据对接插件只导出 / 载入数据，接口读写在宿主完成
  if (props.scene.id === 'market') connectMarketApi(instance);
  ready.value = true;
}

function openConfig() {
  void editor.value?.execute('settings.open', 'plugins');
}

async function addPlugin(id: string) {
  const plugin = createDemoPlugin(id);
  if (!plugin || !editor.value || pendingId.value) return;
  pendingId.value = id;
  message.value = '';
  try {
    await editor.value.use(plugin);
    added.value = [...added.value, id];
    saveAddedPlugins(props.scene.id, added.value);
  } catch (error) {
    console.error(error);
    message.value = '添加失败';
  } finally {
    pendingId.value = null;
  }
}

function removePlugin(id: string) {
  editor.value?.unuse(id);
  added.value = added.value.filter((item) => item !== id);
  saveAddedPlugins(props.scene.id, added.value);
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
      <button v-if="scene.allowConfig" type="button" :disabled="!ready" @click="openConfig">插件配置</button>
      <button v-if="scene.allowAdd" type="button" :disabled="!ready" @click="pickerOpen = !pickerOpen">添加插件</button>
      <div v-if="pickerOpen" class="host-menu">
        <template v-if="addedPlugins.length">
          <div class="host-menu__section">已添加</div>
          <div v-for="item in addedPlugins" :key="item.id" class="host-menu__row">
            <span>{{ item.title }}</span>
            <button type="button" @click="removePlugin(item.id)">移除</button>
          </div>
        </template>
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
