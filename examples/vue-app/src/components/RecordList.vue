<script setup lang="ts">
import type { ArchiveRecord } from '@kabel/vue';

defineProps<{ records: ArchiveRecord[]; current: number }>();
defineEmits<{ open: [index: number] }>();

const done = (r: ArchiveRecord) => !!(r.values.title && r.values.docDate && r.values.author);
</script>

<template>
  <div class="record-list">
    <table>
      <thead>
        <tr>
          <th class="no">件号</th>
          <th>题名</th>
          <th class="state">状态</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(r, i) in records"
          :key="r.id"
          :class="{ active: i === current }"
          @click="$emit('open', i)"
        >
          <td class="no">{{ r.values.itemNo ?? '—' }}</td>
          <td class="title">{{ r.values.title || '（未著录）' }}</td>
          <td class="state" :class="done(r) ? 'ok' : 'todo'">{{ done(r) ? '已著录' : '待著录' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* 直接复用 Kabel 设计令牌，保持与工作台一致 */
.record-list {
  height: 100%;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th,
td {
  height: 30px;
  padding: 0 8px;
  border-bottom: 1px solid var(--kb-color-divider);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
th {
  position: sticky;
  top: 0;
  background: var(--kb-color-surface-2);
  font-weight: 600;
}
.no {
  width: 48px;
}
.state {
  width: 64px;
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover {
  background: var(--kb-color-hover);
}
tbody tr.active {
  background: var(--kb-color-primary-soft);
}
tbody tr.active .title {
  color: var(--kb-color-primary);
  font-weight: 600;
}
.ok {
  color: var(--kb-color-success);
}
.todo {
  color: var(--kb-color-warning);
}
</style>
