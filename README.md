# Kabel · 通用档案著录工具

可通过 npm 引入、集成到任意系统页面的档案著录组件。微内核 + 插件架构（一切皆插件），原生 TypeScript 内核、Preact 轻量渲染层，提供 Vue 3 适配器。

```
┌──── 工具栏：保存/撤销… │ 标记类型 [1 题名][2 文号][3 责任者]…（数字键切换） ────── ⚙ ┐
├────────────┬┬──┬──────┬──────────────────────────────┬┬─────────────────────┤
│ 扩展区域    ││工││缩略图││ 影像（撑满高度，最大化显示）    ││ 标记 | 著录信息 | …  │
│ 件目录等    ││具││ 竖列 ││ 拉框标记、选中/移动/调整大小    ││ 标记列表（类型、bbox）│
│ （宿主面板）││条││      ││                              ││ 导出 JSON / YOLO    │
├────────────┴┴──┴──────┴──────────────────────────────┴┴─────────────────────┤
│ 状态栏（插件贡献状态项）                                                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 特性

- **一切皆插件**：内核只提供事件、状态、历史、命令、服务、扩展点；布局、撤销重做、影像查看、设置、主题作为 baseline **内置插件**（不可停用），文书著录、图片标记、辅助信息等功能插件可在运行期启停、替换、卸载。
- **编译期 / 运行期注册**：`plugins` 选项静态注册；`editor.use(() => import('./x'))` 运行期懒加载；`editor.unuse(name)` 卸载并自动清理。
- **可预测状态 + 撤销/重做**：单一状态树，所有变更经 `dispatch(action)`；快照式历史，连续输入自动合并，支持事务与保存点（dirty）。
- **三栏可调布局**：拖拽调宽/调高、折叠、最大化（Esc 还原）、状态持久化；按容器宽度响应式（宽屏三栏 / 中屏右栏浮层 / 窄屏单栏切换）。
- **文书著录**（可选）：Schema 驱动表单、校验、保存流程；面板顶部提供 AI 填充入口（由宿主实现）与元数据设置（切换必填 / 显示、导入导出 Schema）。
- **图片标记**：顶部选择标记类型（数字键 1–9 切换），在影像上拉框标记，右侧列表记录类型与 bbox；支持旋转/缩放下标记、撤销重做，导出 YOLO（zip）与 JSON。
- **多种参数格式**：Schema 支持完整结构 / 字段数组 / 分组数组 / JSON；影像支持 URL、base64（自动识别 MIME）、Blob/File、ArrayBuffer、对象、异步加载器。
- **影像查看**：影像撑满中间区域；侧边竖排工具条与缩略图列，支持按目录（`group`）分组。
- **设置**：工具栏右侧设置入口——著录项、插件管理（按依赖关系树形显示、运行期启停）、主题（浅色 / 深色 / 跟随系统、主题色、界面密度、字号）。
- **与宿主双向通信**：`on('save', async ...)` 可返回 Promise；`emit` / `execute` / 实例 API 反向控制。
- **不污染宿主**：样式全部作用于 `.kb-root` 下，设计令牌为 CSS 变量；快捷键只在工作台内生效。
- **图标统一 iconfont**：内置 iconfont Symbol 雪碧图，可切换为宿主 iconfont 项目（Symbol 或 Font class）。
- **完整类型**：各包导出完整 `.d.ts`，插件通过模块扩充为状态与事件补充类型。

## 包结构

| 包 | 说明 |
| --- | --- |
| `@kabel/core` | 微内核：EventBus、Store、History、Commands、Services、ExtensionPoints、PluginManager；`@kabel/core/testing` 单测辅助 |
| `@kabel/ui` | 渲染层（Preact）：工作台外壳、内置插件（布局 / 设置 / 主题）、通用组件（Button/Tabs/Resizer/表单控件…）、图标、样式、Tailwind 预设 |
| [`@kabel/plugin-viewer`](packages/plugin-viewer/README.md) | 影像查看（内置，中间区域）：多源图片、缩放/旋转/拖拽/翻页、侧边工具条、按目录分组的缩略图；覆盖层与工具条扩展点 |
| [`@kabel/plugin-annotation`](packages/plugin-annotation/README.md) | 图片标记：标记类型、拉框标注、标记列表、导出 YOLO / JSON |
| [`@kabel/plugin-metadata`](packages/plugin-metadata/README.md) | 文书著录（可选，右侧）：Schema 驱动表单、校验、保存流程、AI 填充入口、著录项设置、字段类型扩展点 |
| [`@kabel/plugin-inspector`](packages/plugin-inspector/README.md) | 辅助信息（随文书著录启用）：校验结果、操作记录 |
| `@kabel/editor` | **主包**：baseline 预设 + `createArchiveEditor` 宿主 API，并再导出以上各包 |
| `@kabel/vue` | **Vue 3 适配器**：`<KabelEditor>`、`<KabelPanel>`、`<KabelToolbarButton>`、`vueView()`、组合式 API |

baseline 组成：布局、撤销与重做、影像查看、设置、主题（内置）+ 图片标记；传入 `schema` / `record` / `metadata` 时追加文书著录与辅助信息。按需组合：`createArchiveEditor(el, { preset: [layoutPlugin(), historyPlugin(), metadataPlugin()] })`。各插件的功能与集成方式见其目录下的 README。

## 在 Vue 3 项目中使用

```bash
npm install @kabel/vue
```

```ts
// main.ts
import { KabelVue } from '@kabel/vue';
import '@kabel/vue/style.css';
createApp(App).use(KabelVue).mount('#app');
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { ArchiveRecord, SavePayload } from '@kabel/vue';

const record = ref<ArchiveRecord>({ id: 'WS-2024-0015', values: { title: '关于……的通知' } });
const schema = [
  { key: 'title', label: '题名', required: true, span: 'full' },
  { key: 'year', label: '年度', type: 'number', required: true },
  { key: 'retention', label: '保管期限', type: 'select', options: ['永久', '定期30年', '定期10年'] },
];
const images = [
  { url: '/scans/0001.jpg', group: '正文' },
  { base64: rawBase64String, name: '0002.jpg', group: '正文' },
  { blob: file, name: '0003.jpg', group: '附件' },
];

// 返回 Promise：编辑器显示“保存中…”，reject 即保存失败
async function onSave({ record }: SavePayload) {
  await api.save(record);
}
</script>

<template>
  <KabelEditor v-model:record="record" :schema="schema" :images="images" instance-id="document" @save="onSave">
    <!-- 宿主 Vue 内容作为面板嵌入，保留宿主的响应式 / provide / 全局组件 -->
    <KabelPanel id="host.related" region="right" title="关联文件">
      <RelatedFiles :id="record.id" />
    </KabelPanel>
    <KabelToolbarButton id="host.submit" icon="submit" label="提交审核" @click="submit" />
  </KabelEditor>
</template>
```

组件高度默认 `100%`，请给父容器设置高度（或传 `height` 属性）。

## 不使用框架

```ts
import { createArchiveEditor } from '@kabel/editor';
import '@kabel/editor/style.css';

const editor = createArchiveEditor('#app', { schema, record, images, annotation: { labels: ['题名', '文号', '印章'] } });
editor.on('save', ({ record }) => api.save({ record, annotations: editor.getAnnotations() }));
editor.setValue('year', 2024);
editor.exportAnnotations('yolo');   // { 'classes.txt': …, 'labels/0001.txt': … }
await editor.use(myPlugin());
```

## 文档

- [架构设计](docs/architecture.md)
- [插件开发指南](docs/plugin-guide.md)
- [Vue 3 集成](docs/vue.md)
- [API 参考](docs/api.md)
- [主题、样式与图标](docs/theming.md)

## 开发

```bash
pnpm install
pnpm build        # 构建全部包（ESM + CJS + d.ts + style.css）
pnpm test         # 单元测试（Vitest + happy-dom）
pnpm typecheck
pnpm dev          # 启动 Vue 3 示例：examples/vue-app
pnpm pack:all     # 打包 tarball 到 .packs/，可在任意项目中 npm install 验证
```

目录：

```
packages/        各 npm 包（src / test / README.md）
examples/vue-app Vue 3 + Vite 宿主示例（v-model、@save、KabelPanel 件目录、按件保存图片标记、影像目录分组）
examples/plugins 以独立包形式分发的示例插件（每个插件一个目录：src / test / README.md），见其 README
docs/            文档
```
