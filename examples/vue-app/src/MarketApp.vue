<script setup lang="ts">
import { KabelEditor, type SavePayload } from '@kabel/vue';
import { FIELDS_SERVICE } from '@kabel/plugin-fields';
import { marketSupervisionPreset } from '@kabel/plugin-market-supervision';
import { ref, shallowRef } from 'vue';
import { marketImages } from './market';

/**
 * 场景：市场监管档案加工。宿主只做三件事：传入影像、注册场景预设、在 save 事件里落库。
 * 字段分组、识别 / 大模型地址都在 设置 › 插件管理 中配置（持久化在浏览器中）。
 */
const images = shallowRef(marketImages());
const editor = ref<InstanceType<typeof KabelEditor>>();
const plugins = [marketSupervisionPreset()];

async function onSave(_payload: SavePayload) {
  const values = editor.value?.getEditor()?.kernel.services.tryGet(FIELDS_SERVICE)?.values();
  console.info('[host] 保存字段', values);
  await new Promise((r) => setTimeout(r, 300));
}
</script>

<template>
  <div class="host">
    <main class="host-main">
      <KabelEditor
        ref="editor"
        instance-id="market"
        :images="images"
        :plugins="plugins"
        :layout="{ regions: { left: { size: 640, max: 900 }, right: { size: 260 } } }"
        @save="onSave"
        @saved="editor?.notify('已保存', { type: 'success' })"
        @error="({ error }) => console.error(error)"
      />
    </main>
  </div>
</template>
