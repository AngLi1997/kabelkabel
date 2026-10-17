<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SceneList from './SceneList.vue';
import SceneWorkbench from './SceneWorkbench.vue';
import { findScene, type SceneId } from './scenes';

const sceneId = ref<string | null>(readScene());
const scene = computed(() => findScene(sceneId.value));

function readScene(): string | null {
  return new URLSearchParams(location.search).get('scene');
}

function syncFromUrl() {
  sceneId.value = readScene();
}

function enter(id: SceneId) {
  const url = new URL(location.href);
  url.searchParams.set('scene', id);
  history.pushState({}, '', url);
  sceneId.value = id;
}

function back() {
  const url = new URL(location.href);
  url.searchParams.delete('scene');
  history.pushState({}, '', url);
  sceneId.value = null;
}

onMounted(() => window.addEventListener('popstate', syncFromUrl));
onUnmounted(() => window.removeEventListener('popstate', syncFromUrl));
</script>

<template>
  <SceneWorkbench v-if="scene" :key="scene.id" :scene="scene" @back="back" />
  <SceneList v-else @enter="enter" />
</template>
