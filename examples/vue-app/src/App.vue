<script setup lang="ts">
import { KabelEditor, KabelPanel, KabelToolbarButton, type SavePayload } from '@kabel/vue';
import { ref, shallowRef } from 'vue';
import CurrentFile from './components/CurrentFile.vue';
import { fileLoaderPlugin } from '@kabel/plugin-file-loader';
import { regionSelectPlugin } from '@kabel/plugin-region-select';
import { sampleImages } from './scans';

const images = shallowRef(sampleImages('关于档案工作的通知'));
const editor = ref<InstanceType<typeof KabelEditor>>();
const readonly = ref(false);
const plugins = [fileLoaderPlugin(), regionSelectPlugin()];
const reload = () => (images.value = sampleImages('关于档案工作的通知'));

/** 宿主保存：返回 Promise，编辑器会等待其完成；抛出异常即保存失败 */
async function onSave(_payload: SavePayload) {
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
