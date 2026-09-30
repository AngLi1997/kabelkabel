<script setup lang="ts">
import { useKabelState } from '@kabel/vue';
import { computed } from 'vue';

const documents = useKabelState((s) => s.documents, undefined);
const image = computed(() => documents.value?.items[documents.value.index]);
</script>

<template>
  <dl v-if="image" class="current">
    <dt>文件名</dt>
    <dd>{{ image.name }}</dd>
    <dt>所属目录</dt>
    <dd>{{ image.group || '未分组' }}</dd>
    <dt>类型</dt>
    <dd>{{ image.kind }}</dd>
    <dt>序号</dt>
    <dd>{{ documents!.index + 1 }} / {{ documents!.items.length }}</dd>
  </dl>
  <p v-else class="current__empty">暂无文件</p>
</template>

<style scoped>
.current {
  margin: 0;
  padding: 12px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 12px;
  font-size: 13px;
}
.current dt {
  color: #5a6270;
}
.current dd {
  margin: 0;
  word-break: break-all;
}
.current__empty {
  padding: 12px;
  color: #5a6270;
}
</style>
