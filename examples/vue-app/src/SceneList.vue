<script setup lang="ts">
import { loadAddedPlugins, scenes, type SceneId } from './scenes';

const emit = defineEmits<{ enter: [id: SceneId] }>();

function pluginText(id: SceneId, label: string, allowAdd: boolean): string {
  if (!allowAdd) return label;
  const count = loadAddedPlugins(id).length;
  return count ? `${label}（已添加 ${count} 个）` : label;
}
</script>

<template>
  <div class="scene-page">
    <header class="scene-page__bar">场景工作台</header>
    <div class="scene-page__body">
      <table class="scene-table">
        <thead>
          <tr>
            <th>场景</th>
            <th>插件</th>
            <th class="scene-table__action"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scene in scenes" :key="scene.id" @click="emit('enter', scene.id)">
            <td>{{ scene.title }}</td>
            <td>{{ pluginText(scene.id, scene.pluginsLabel, scene.allowAdd) }}</td>
            <td class="scene-table__action">
              <button type="button" @click.stop="emit('enter', scene.id)">进入</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
