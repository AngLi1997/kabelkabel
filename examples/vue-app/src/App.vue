<script setup lang="ts">
import { KabelEditor, KabelPanel, KabelToolbarButton, type ArchiveRecord, type SavePayload } from '@kabel/vue';
import { computed, ref, shallowRef } from 'vue';
import { archiveCodePlugin } from '@kabel-examples/plugins/archive-code';
import RecordList from './components/RecordList.vue';
import { records as seed } from './records';
import { documentSchema } from './schema';
import { sampleImages } from './scans';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const list = ref<ArchiveRecord[]>(clone(seed));
const current = ref(0);
const record = ref<ArchiveRecord>(clone(list.value[0]!));
const images = shallowRef(sampleImages(String(record.value.values.title ?? '')));
const editor = ref<InstanceType<typeof KabelEditor>>();
const dirty = ref(false);
const log = ref('');
const ocrLoaded = ref(false);

// 编译期注册的插件
const plugins = [archiveCodePlugin()];

const now = () => new Date().toTimeString().slice(0, 8);

/** 宿主保存：返回 Promise，编辑器会等待其完成；抛出异常即保存失败 */
async function onSave({ record: saved }: SavePayload) {
  await new Promise((r) => setTimeout(r, 400));
  list.value[current.value] = clone(saved);
  log.value = `${now()} 已保存 ${saved.id}`;
}

function open(index: number) {
  if (index === current.value || index < 0 || index >= list.value.length) return;
  if (dirty.value && !window.confirm('当前档案有未保存的修改，确定切换吗？')) return;
  current.value = index;
  record.value = clone(list.value[index]!);
  images.value = sampleImages(String(record.value.values.title ?? '文件'));
}

async function toggleOcr() {
  if (ocrLoaded.value) {
    editor.value?.unuse('example:ocr-assist');
    ocrLoaded.value = false;
    log.value = `${now()} 已卸载识别插件`;
    return;
  }
  // 运行期按需加载插件
  await editor.value?.use(() => import('@kabel-examples/plugins/ocr-assist'));
  ocrLoaded.value = true;
  log.value = `${now()} 已加载识别插件`;
}

const position = computed(() => `${current.value + 1} / ${list.value.length}`);
</script>

<template>
  <div class="host">
    <nav class="host-nav">
      <span class="host-nav__brand">档案管理系统</span>
      <span class="host-nav__crumb">文书档案 / 归档文件著录 / {{ record.id }}（{{ position }}）</span>
      <span class="host-nav__spacer" />
      <span class="host-nav__log">{{ log }}</span>
    </nav>
    <main class="host-main">
      <KabelEditor
        ref="editor"
        v-model:record="record"
        instance-id="demo"
        :schema="documentSchema"
        :images="images"
        :plugins="plugins"
        @save="onSave"
        @dirty-change="dirty = $event"
        @error="({ error }) => console.error(error)"
      >
        <KabelToolbarButton id="host.sep" separator :order="49" />
        <KabelToolbarButton id="host.prev" icon="arrow-up" label="上一件" :order="50" @click="open(current - 1)" />
        <KabelToolbarButton id="host.next" icon="arrow-down" label="下一件" :order="51" @click="open(current + 1)" />
        <KabelToolbarButton
          id="host.ocr"
          group="end"
          icon="plus"
          :label="ocrLoaded ? '卸载识别插件' : '加载识别插件'"
          :order="800"
          @click="toggleOcr"
        />

        <KabelPanel id="host.records" region="left" title="件目录" :order="20">
          <RecordList :records="list" :current="current" @open="open" />
        </KabelPanel>
      </KabelEditor>
    </main>
  </div>
</template>
