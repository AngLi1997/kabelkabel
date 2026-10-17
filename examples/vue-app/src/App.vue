<script setup lang="ts">
import { KabelEditor, KabelPanel, KabelToolbarButton, type SavePayload } from '@kabel/vue';
import { ref, shallowRef } from 'vue';
import CurrentFile from './components/CurrentFile.vue';
import { dataTablePlugin } from '@kabel/plugin-data-table';
import { fileLoaderPlugin } from '@kabel/plugin-file-loader';
import { regionSelectPlugin } from '@kabel/plugin-region-select';
import { marketRegulationTable } from './mock/market-regulation';
import { sampleImages } from './scans';

const images = shallowRef(sampleImages('关于档案工作的通知'));
const editor = ref<InstanceType<typeof KabelEditor>>();
const readonly = ref(false);
const plugins = [fileLoaderPlugin(), regionSelectPlugin(), dataTablePlugin({ tables: [marketRegulationTable] })];
// 左侧上半区为文件目录、下半区为数据表格，适当加宽
const layout = { regions: { left: { size: 540, max: 640, split: 0.5 } } };
const reload = () => (images.value = sampleImages('关于档案工作的通知'));

/** 宿主保存：返回 Promise，编辑器会等待其完成；抛出异常即保存失败。`payload.data` 为全部插件的提交数据 */
async function onSave(payload: SavePayload) {
  console.info('提交数据', payload.data);
  await new Promise((r) => setTimeout(r, 400));
}
</script>

<template>
  <div class="host">
    <main class="host-main">
      <KabelEditor
        ref="editor"
        instance-id="demo"
        :images="images"
        :readonly="readonly"
        :plugins="plugins"
        :layout="layout"
        @save="onSave"
        @saved="editor?.notify('已保存', { type: 'success' })"
        @error="({ error }) => console.error(error)"
      >
        <KabelToolbarButton id="host.reload" icon="rotate-right" label="重新载入" :order="50" @click="reload" />
        <KabelToolbarButton id="host.readonly" icon="eye" :label="readonly ? '取消只读' : '只读'" :order="51" @click="readonly = !readonly" />

        <!-- 右侧是通用扩展区域：宿主或插件贡献面板后才会出现 -->
        <KabelPanel id="host.current" region="right" title="当前文件" :order="10">
          <CurrentFile />
        </KabelPanel>
      </KabelEditor>
    </main>
  </div>
</template>
