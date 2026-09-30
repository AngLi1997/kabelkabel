# Kabel · 通用档案工具底座

可通过 npm 引入、集成到任意系统页面的档案工具底座。微内核 + 插件架构（一切皆插件），原生 TypeScript 内核、Preact 轻量渲染层，提供 Vue 3 适配器。底座只负责工作台骨架与**工作台插件**（文件、内容、影像舞台），业务功能（著录、标注等）全部以插件形式接入，并只依赖工作台。

```
┌──────────────────── 顶部工具栏（撤销/重做 · 插件按钮 …………… 布局 · 设置）────────────────────┐
├───────────────┬┬─────────────────────────────────────────────┬┬───────────────┤
│ 左侧扩展面板   ││ 内容                                         ││ 右侧扩展面板   │
│ 默认：文件目录 ││ 默认：当前文件的影像（侧边工具条 + 影像舞台）    ││ 默认：无       │
│（按目录分组）  ││                                              ││（有面板才出现） │
├───────────────┴┴─────────────────────────────────────────────┴┴───────────────┤
│ 底部状态栏（插件贡献状态项）                                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 特性

- **一切皆插件**：内核只提供事件、状态、历史、命令、服务、扩展点；布局、撤销重做、只读、保存、消息、快捷键、右键菜单、命令面板、工作台、设置、主题作为 baseline **内置插件**（不可停用）。业务功能插件可在运行期注册、启停、替换、卸载。
- **五段式工作台**：顶部工具栏、中间左侧扩展面板、中间内容、中间右侧扩展面板、底部状态栏。左右两侧不预设用途，由任意插件通过扩展点 `panels`（`region: 'left' | 'right'`）贡献；区域内没有面板时整个区域不渲染。
- **默认文件目录 + 影像**：左侧默认显示当前工具打开的文件目录（按 `group` 分组、可折叠），点击文件在内容区域展示影像。
- **工作台（所有业务插件的底座）**：维护“当前打开的文件”（`state.documents`）与影像舞台（`state.stage`），提供左侧文件目录、内容面板，以及扩展点 `WorkspaceExtensions`——渲染器（接入 PDF、OFD 等类型）、覆盖层（在影像上叠加标注 / 选区）、工具条。业务插件只依赖它；内置的目录、面板、渲染器用同 id 贡献即可替换。
- **保存契约**：`kabel.save`（Mod+S）等待所有 `save` 事件处理器，成功后标记已保存；状态栏提示未保存 / 保存中 / 失败，离开页面时确认。
- **只读模式**：`readonly` 选项 / `setReadonly()`；声明 `mutates: true` 的命令自动禁用。
- **消息与对话框**：`notify()` 提示、`confirm()` 确认（服务令牌 `NOTIFY_SERVICE`）。
- **命令面板**：`Shift + ⌘/Ctrl + P` 搜索并执行任意命令。
- **快捷键改绑**：设置 › 快捷键 中查看、修改、清除、恢复默认，冲突时提示并可覆盖，持久化。
- **右键菜单**：`data-kb-context` 标识区域 + 扩展点 `contextMenu`。
- **视图错误隔离**：单个面板渲染出错只影响自身，显示重试，并派发 `error` 事件。
- **编译期 / 运行期注册**：`plugins` 选项静态注册；`editor.use(() => import('./x'))` 运行期懒加载；`editor.unuse(name)` 卸载并自动清理。
- **可预测状态 + 撤销/重做**：单一状态树，所有变更经 `dispatch(action)`；快照式历史，连续输入自动合并，支持事务与保存点（dirty）。
- **可调布局**：拖拽调宽、折叠、最大化（Esc 还原）、状态持久化；按容器宽度响应式（宽屏三栏 / 中屏右栏浮层 / 窄屏单栏切换）。
- **多种影像源**：URL、base64（自动识别 MIME）、Blob/File、ArrayBuffer、对象、异步加载器；缩放、旋转、拖拽、翻页，覆盖层与工具条扩展点。
- **设置**：工具栏右侧设置入口——插件管理（按依赖关系树形显示、运行期启停）、主题（浅色 / 深色 / 跟随系统、主题色、界面密度、字号）。
- **不污染宿主**：样式全部作用于 `.kb-root` 下，设计令牌为 CSS 变量；快捷键只在工作台内生效。
- **图标统一 iconfont**：内置 iconfont Symbol 雪碧图，可切换为宿主 iconfont 项目（Symbol 或 Font class）。
- **完整类型**：各包导出完整 `.d.ts`，插件通过模块扩充为状态与事件补充类型。

## 包结构

| 包 | 说明 |
| --- | --- |
| `@kabel/core` | 微内核：EventBus、Store、History、Commands、Services、ExtensionPoints、PluginManager；内置的只读模式与保存契约；`@kabel/core/testing` 单测辅助 |
| `@kabel/ui` | 渲染层（Preact）：工作台外壳、内置插件（布局 / 文件与内容 / 消息 / 快捷键 / 右键菜单 / 命令面板 / 设置 / 主题）、通用组件（Button/Tabs/Resizer/表单控件…）、图标、样式 |
| [`@kabel/plugin-workspace`](packages/plugins/workspace/README.md) | 工作台（内置，所有业务插件的底座）：文档模型、文件目录、内容面板、渲染器 / 覆盖层 / 工具条扩展点、影像舞台与多源图片解析 |
| `@kabel/editor` | **主包**：baseline 预设 + `createArchiveEditor` 宿主 API，并再导出以上各包 |
| `@kabel/vue` | **Vue 3 适配器**：`<KabelEditor>`、`<KabelPanel>`、`<KabelToolbarButton>`、`vueView()`、组合式 API |

后续扩展的业务插件统一放在 [`packages/plugins`](packages/plugins/README.md)，包名 `@kabel/plugin-<name>`。

baseline 组成（均为内置）：布局、撤销与重做、只读模式、保存、消息与对话框、快捷键、右键菜单、命令面板、工作台、设置、主题。按需组合：`createArchiveEditor(el, { preset: [layoutPlugin(), historyPlugin(), workspacePlugin()] })`。

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
const images = [
  { url: '/scans/0001.jpg', group: '正文' },
  { base64: rawBase64String, name: '0002.jpg', group: '正文' },
  { blob: file, name: '0003.jpg', group: '附件' },
];
</script>

<template>
  <!-- @save 返回 Promise：编辑器显示“保存中…”，reject 即保存失败 -->
  <KabelEditor :images="images" :readonly="readonly" instance-id="document" @save="onSave">
    <!-- 宿主 Vue 内容作为面板嵌入，保留宿主的响应式 / provide / 全局组件；region 可选 left / right -->
    <KabelPanel id="host.info" region="right" title="文件信息">
      <FileInfo />
    </KabelPanel>
    <KabelToolbarButton id="host.reload" icon="rotate-right" label="重新载入" @click="reload" />
  </KabelEditor>
</template>
```

组件高度默认 `100%`，请给父容器设置高度（或传 `height` 属性）。

## 不使用框架

```ts
import { createArchiveEditor } from '@kabel/editor';
import '@kabel/editor/style.css';

const editor = createArchiveEditor('#app', { images });
editor.on('document:change', ({ index, document }) => console.log(index, document?.name));
editor.on('save', async () => api.save());   // Mod+S / editor.save() 会等待它完成
editor.setReadonly(true);
editor.notify('已保存', { type: 'success' });
await editor.setImages(nextFiles);      // 打开另一批文件
await editor.use(myPlugin());           // 运行期注册插件：向左 / 右侧面板、工具栏、状态栏贡献内容
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
packages/        各 npm 包（core / ui / editor / vue，均含 README.md）
packages/plugins 插件（workspace 工作台 + 后续扩展的业务插件；每个插件一个目录：src / test / README.md），见其 README
examples/vue-app Vue 3 + Vite 宿主示例（默认文件目录 + 影像、KabelPanel 右侧面板、工具栏按钮、保存与只读）
docs/            文档
```
