# Kabel · 通用档案著录工具

可通过 npm 引入、集成到任意系统页面的档案著录组件。微内核 + 插件架构（一切皆插件），原生 TypeScript 内核、Preact 轻量渲染层，提供 Vue 3 适配器。

```
┌──────────────────────── 工具栏（插件贡献按钮） ─────────────────────────┐
├──────────────┬┬──────────────────────────────┬┬─────────────────────────┤
│ 扩展区域      ││ 著录信息区域                   ││ 通用插件槽               │
│ 影像 / 件目录 ││ 通用元数据编辑器               ││ 校验结果 / 操作记录      │
│ （标签页）    ││                              ││ （上下堆叠，可调高度）    │
├──────────────┴┴──────────────────────────────┴┴─────────────────────────┤
│ 状态栏（插件贡献状态项）                                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

## 特性

- **一切皆插件**：内核只提供事件、状态、历史、命令、服务、扩展点；布局、撤销按钮、编辑器、影像查看都是插件，可替换、可卸载。
- **编译期 / 运行期注册**：`plugins` 选项静态注册；`editor.use(() => import('./x'))` 运行期懒加载；`editor.unuse(name)` 卸载并自动清理。
- **可预测状态 + 撤销/重做**：单一状态树，所有变更经 `dispatch(action)`；快照式历史，连续输入自动合并，支持事务与保存点（dirty）。
- **三栏可调布局**：拖拽调宽/调高、折叠、最大化（Esc 还原）、状态持久化；按容器宽度响应式（宽屏三栏 / 中屏右栏浮层 / 窄屏单栏切换）。
- **多种参数格式**：Schema 支持完整结构 / 字段数组 / 分组数组 / JSON；影像支持 URL、base64（自动识别 MIME）、Blob/File、ArrayBuffer、对象、异步加载器。
- **与宿主双向通信**：`on('save', async ...)` 可返回 Promise；`emit` / `execute` / 实例 API 反向控制。
- **不污染宿主**：样式全部作用于 `.kb-root` 下，设计令牌为 CSS 变量；快捷键只在工作台内生效。
- **图标统一 iconfont**：内置 iconfont Symbol 雪碧图，可切换为宿主 iconfont 项目（Symbol 或 Font class）。
- **完整类型**：各包导出完整 `.d.ts`，插件通过模块扩充为状态与事件补充类型。

## 包结构

| 包 | 说明 |
| --- | --- |
| `@kabel/core` | 微内核：EventBus、Store、History、Commands、Services、ExtensionPoints、PluginManager；`@kabel/core/testing` 单测辅助 |
| `@kabel/ui` | 渲染层（Preact）：工作台外壳、布局插件、通用组件（Button/Tabs/Resizer/表单控件…）、图标、样式、Tailwind 预设 |
| `@kabel/plugin-metadata` | 通用元数据编辑器：Schema 驱动表单、校验、字段类型扩展点、保存流程 |
| `@kabel/plugin-viewer` | 影像查看：多源图片、缩放/旋转/拖拽/翻页、缩略图 |
| `@kabel/plugin-inspector` | 右侧插件槽默认内容：校验结果、操作记录 |
| `@kabel/editor` | **主包**：baseline 预设 + `createArchiveEditor` 宿主 API，并再导出以上各包 |
| `@kabel/vue` | **Vue 3 适配器**：`<KabelEditor>`、`<KabelPanel>`、`<KabelToolbarButton>`、`vueView()`、组合式 API |

按需使用：只要编辑器能力可以 `createArchiveEditor(el, { preset: [layoutPlugin(), metadataPlugin()] })` 自行组合。

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
const images = ['/scans/0001.jpg', rawBase64String, { blob: file, name: '0003.jpg' }];

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

const editor = createArchiveEditor('#app', { schema, record, images });
editor.on('save', ({ record }) => api.save(record));
editor.setValue('year', 2024);
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
packages/        各 npm 包（src / test）
examples/vue-app Vue 3 + Vite 宿主示例（v-model、@save、KabelPanel、运行期加载插件）
examples/plugins 以独立包形式分发的示例插件：档号生成（编译期）、识别填充（运行期懒加载），含单测
docs/            文档
```
