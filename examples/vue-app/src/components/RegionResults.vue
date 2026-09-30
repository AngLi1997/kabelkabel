<script setup lang="ts">
import type { RegionSelection } from '@kabel/plugin-region-select';
import { useKabel } from '@kabel/vue';
import { onBeforeUnmount, ref, watch } from 'vue';

/** 下游示例：订阅 region:select，把裁剪图加入自己的列表（框选插件本身不保存任何结果） */
interface Item {
  id: string;
  url: string;
  label: string;
  origin: string;
}

const editor = useKabel();
const items = ref<Item[]>([]);

watch(
  editor,
  (instance, _prev, onCleanup) => {
    if (!instance) return;
    const off = instance.on('region:select', (e: RegionSelection) => {
      if (!e.crop) return;
      items.value.unshift({
        id: e.id,
        url: URL.createObjectURL(e.crop.blob),
        label: `${e.shape.type} ${e.crop.width}×${e.crop.height} @${e.bbox.x},${e.bbox.y}`,
        origin: e.origin,
      });
    });
    onCleanup(off);
  },
  { immediate: true },
);

const clear = () => {
  items.value.forEach((i) => URL.revokeObjectURL(i.url));
  items.value = [];
};
onBeforeUnmount(clear);
</script>

<template>
  <div class="results">
    <p v-if="!items.length" class="results__empty">在影像工具条选择“矩形框选 / 多边形框选”，框选后结果出现在这里</p>
    <template v-else>
      <button type="button" class="results__clear" @click="clear">清空</button>
      <figure v-for="item in items" :key="item.id" class="results__item">
        <img :src="item.url" :alt="item.label" />
        <figcaption>{{ item.label }}</figcaption>
      </figure>
    </template>
  </div>
</template>

<style scoped>
.results {
  padding: 12px;
  display: grid;
  gap: 10px;
  font-size: 12px;
}
.results__empty {
  margin: 0;
  color: #5a6270;
}
.results__clear {
  justify-self: end;
}
.results__item {
  margin: 0;
  display: grid;
  gap: 4px;
}
.results__item img {
  max-width: 100%;
  border: 1px solid #d8dce2;
  background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 12px 12px;
}
</style>
