<script setup lang="ts">
import {
  KabelEditor,
  KabelPanel,
  KabelToolbarButton,
  type AnnotationDocument,
  type ArchiveRecord,
  type SavePayload,
} from '@kabel/vue';
import { nextTick, ref, shallowRef } from 'vue';
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
/** 各件档案已保存的图片标记（宿主持久化的模拟） */
const annotations = new Map<string, AnnotationDocument>();

// 编译期注册的插件
const plugins = [archiveCodePlugin()];

/** 宿主保存：返回 Promise，编辑器会等待其完成；抛出异常即保存失败 */
async function onSave({ record: saved }: SavePayload) {
  await new Promise((r) => setTimeout(r, 400));
  list.value[current.value] = clone(saved);
  const doc = editor.value?.getAnnotations();
  if (saved.id && doc) annotations.set(saved.id, doc);
}

async function open(index: number) {
  if (index === current.value || index < 0 || index >= list.value.length) return;
  if (dirty.value && !window.confirm('当前档案有未保存的修改，确定切换吗？')) return;
  current.value = index;
  record.value = clone(list.value[index]!);
  images.value = sampleImages(String(record.value.values.title ?? '文件'));
  // 影像开始加载后提交该件的标记，编辑器会在影像就绪后载入
  await nextTick();
  editor.value?.setAnnotations(annotations.get(String(record.value.id)) ?? null);
}
</script>

<template>
  <div class="host">
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

        <KabelPanel id="host.records" region="left" title="件目录" :order="20">
          <RecordList :records="list" :current="current" @open="open" />
        </KabelPanel>
      </KabelEditor>
    </main>
  </div>
</template>
