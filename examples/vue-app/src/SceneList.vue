<script setup lang="ts">
import { loadAddedPlugins, loadManagedPlugins, scenes, type DemoScene, type SceneId } from './scenes';

const emit = defineEmits<{ enter: [id: SceneId] }>();

function pluginText(scene: DemoScene): string {
  if (scene.catalog) {
    const count = loadManagedPlugins(
      scene.id,
      scene.defaultPluginIds ?? [],
      scene.catalog.map((item) => item.id),
    ).length;
    return `${scene.pluginsLabel}（当前 ${count} 个）`;
  }
  if (!scene.allowAdd) return scene.pluginsLabel;
  const count = loadAddedPlugins(scene.id).length;
  return count ? `${scene.pluginsLabel}（已添加 ${count} 个）` : scene.pluginsLabel;
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
            <td>{{ pluginText(scene) }}</td>
            <td class="scene-table__action">
              <button type="button" @click.stop="emit('enter', scene.id)">进入</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
