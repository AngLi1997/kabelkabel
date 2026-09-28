# API 参考

## `createArchiveEditor(target, options)` — `@kabel/editor`

`target`：元素或选择器。返回 `ArchiveEditor`。

### `EditorOptions`

| 选项 | 说明 |
| --- | --- |
| `schema` | `SchemaInput` |
| `record` | `RecordInput` |
| `images` | `ImageSourceInput[]` |
| `readonly` | 只读 |
| `plugins` | 追加插件 |
| `preset` | 替换 baseline；`false` 不使用预设（baseline 组成见 [架构设计](architecture.md#baseline-与插件分类)） |
| `layout` | `LayoutOptions` |
| `metadata` | 文书著录，见 [plugin-metadata](../packages/plugin-metadata/README.md)：`{ allowInvalidSave?, aiFill?, panel? } \| false`；`aiFill(kernel)` 返回要写入的著录值，未提供时「AI 填充」按钮不可用；传入 `schema` / `record` 或本配置时启用著录信息（右侧） |
| `annotation` | 图片标记，见 [plugin-annotation](../packages/plugin-annotation/README.md)：`{ labels?: (string \| { id?, name, color? })[], fileName?, panel? } \| false` |
| `viewer` | 影像查看，见 [plugin-viewer](../packages/plugin-viewer/README.md)：`{ thumbnails?, panel?, urlFactory? } \| false`（关闭时图片标记一并关闭） |
| `inspector` | 辅助信息，见 [plugin-inspector](../packages/plugin-inspector/README.md)：`{ panels?: ('validation' \| 'history')[] } \| false`（仅在启用文书著录时生效） |
| `settings` | `false` 关闭工具栏右侧的设置入口 |
| `theme` | `{ defaults?: Partial<ThemeState>, accents?: { title, color }[], persist? } \| false` |
| `instanceId` | 持久化命名空间，默认 `default` |
| `storage` | `StorageAdapter \| 'local' \| 'session' \| 'memory' \| false` |
| `history` | `{ limit?: number = 100, coalesceWindow?: number = 1000 }` |
| `icons` | `IconConfig` |
| `class` | 根节点追加 class |
| `on` | 初始事件监听（插件初始化前绑定） |
| `setup(kernel)` | 内核创建后、插件注册前的钩子 |

### `ArchiveEditor`

| 成员 | 说明 |
| --- | --- |
| `kernel` | 底层内核 |
| `ready` | 全部插件就绪的 Promise |
| `on / once / off / emit` | 事件 |
| `execute(id, ...args)` | 执行命令 |
| `use(plugin) / unuse(name)` | 运行期注册 / 卸载 |
| `kernel.plugins.disable(name) / enable(name)` | 停用（保留定义，依赖方一并停用）/ 重新启用（已停用的依赖一并启用）；`builtin`（内置）插件不可停用 |
| `getState() / subscribe(fn)` | 状态 |
| `getRecord() / setRecord(r)` | 档案；`setRecord` 会清空撤销栈并标记已保存 |
| `getValues() / setValue(k, v, label?) / setValues(obj, label?)` | 著录值（进入撤销栈） |
| `setSchema(s) / setImages(list) / setReadonly(b)` | 未启用著录信息时元数据方法静默忽略 |
| `getAnnotations() / setAnnotations(doc)` | 标记（JSON 导出格式）；替换影像时标记清空，`setAnnotations` 可在 `setImages` 后立即调用，影像就绪后生效 |
| `exportAnnotations('json' \| 'yolo')` | JSON 文档，或 YOLO 文件集合（`classes.txt`、`data.yaml`、`labels/*.txt`） |
| `validate()` | `{ valid, errors }` |
| `save()` | `Promise<{ ok: true } \| { ok: false, errors?, error? }>` |
| `undo() / redo() / isDirty()` | |
| `layout.collapse/expand/toggle(region)` | `'left' \| 'right'` |
| `layout.maximize(region) / restore() / reset()` | |
| `destroy()` | 卸载并释放所有插件 |

## 参数格式

### `SchemaInput`

```ts
// 1. 完整结构
{ id?, title?, columns?: 2, labelWidth?: 96, groups: [{ key?, title, columns?, collapsed?, fields: FieldSchema[] }] }
// 2. 分组数组        [{ title, fields }]
// 3. 字段数组        [{ key, label, ... }]        → 单个“基本信息”分组
// 4. { fields }
// 5. 以上任意结构的 JSON 字符串
```

`FieldSchema`：

| 字段 | 说明 |
| --- | --- |
| `key` / `label` | 必填 |
| `type` | `text`（默认）/ `textarea` / `number` / `date` / `select` / `radio` / `checkbox` / 自定义 |
| `required` / `readonly` / `hidden` | |
| `placeholder` / `defaultValue` | |
| `span` | 占用列数或 `'full'` |
| `options` | `['永久','30年']` / `[{ label, value }]` / `{ Y: '永久' }` |
| `min` / `max` / `maxLength` / `pattern` / `message` | 内置校验 |
| `validator(value, values, field)` | 返回错误信息或空 |
| `props` | 透传给字段视图，如 `textarea` 的 `rows`，`date` 的 `valueFormat: 'YYYYMMDD'` |

表单列数会随容器宽度自动减少（单字段最小约 300px）。

### `RecordInput`

`{ id?, values }`（当 `values` 为对象时视为结构化档案）、纯值对象 `{ title: '...' }`、或 JSON 字符串。缺省值按 Schema 的 `defaultValue` 填充。

### `ImageSourceInput`

| 形式 | 示例 |
| --- | --- |
| URL | `'https://…/0001.jpg'`、`'/scans/1.jpg'`、`'data:image/png;base64,…'`、`'blob:…'` |
| 纯 base64 | `'iVBORw0KGgo…'`（根据文件头识别 jpeg/png/gif/webp/bmp/svg） |
| Blob / File | `file` |
| 二进制 | `ArrayBuffer`、`Uint8Array`（根据字节头识别 MIME） |
| 对象 | `{ id?, name?, group?, url? \| src? \| base64? \| blob? \| file? \| data?, mime?, thumbnail? }` |
| 异步加载器 | `async () => (await fetch(url, { headers })).blob()` |

影像对象可带 `group`（所属目录，如“正文”“附件”）：缩略图按目录分组、可折叠，页码与状态栏显示目录内位置。

为 Blob / 二进制创建的 object URL 在替换影像或卸载插件时自动释放；并发 `setImages` 以最后一次为准。

## 命令一览

| 命令 | 参数 / 快捷键 | 说明 |
| --- | --- | --- |
| `kabel.save` | `Mod+S` | 校验 → `emitAsync('save')` → 标记已保存 |
| `kabel.undo` / `kabel.redo` | `Mod+Z` / `Mod+Shift+Z`、`Mod+Y` | |
| `metadata.validate` | | 整体校验 |
| `metadata.focusField` | `key` | 定位字段（显示面板、展开分组、聚焦） |
| `metadata.focusFirstError` | | |
| `metadata.toggleAllGroups` | | |
| `metadata.aiFill` | | AI 填充（需 `metadata.aiFill` 选项） |
| `metadata.openSettings` / `metadata.resetSchema` | | 打开 设置 › 著录项 / 恢复初始著录项方案 |
| `viewer.prev / next / goto` | `goto(index)` | 翻页 |
| `viewer.zoomIn / zoomOut / fit / actual` | | 缩放 |
| `viewer.rotateLeft / rotateRight` | | 旋转 |
| `viewer.toggleThumbnails` | | |
| `annotation.label.1` … `.9` | `1` … `9` | 切换标记类型（有选中时同时修改其类型） |
| `annotation.setLabel` | `labelId` | 同上 |
| `annotation.tool.draw` / `annotation.tool.pan` | `R` / `H` | 框选 / 拖动（按住空格临时拖动） |
| `annotation.delete` / `annotation.deselect` | `Delete`、`Backspace` / `Escape` | |
| `annotation.exportJson` / `annotation.exportYolo` | | 下载导出文件 |
| `layout.toggleLeft / toggleRight` | `collapsed?: boolean` | |
| `layout.maximize` | `region` | 切换最大化 |
| `layout.restore` | `Escape` | |
| `layout.reveal` | `region` | 确保区域可见 |
| `layout.showPanel` | `panelId` | 显示面板所在区域并激活其标签 |
| `layout.reset` | | 重置布局 |
| `settings.open` / `settings.close` | `pageId?` | 打开设置（`metadata` / `plugins` / `theme`） |
| `theme.set` / `theme.reset` | `Partial<ThemeState>` | 修改 / 恢复主题 |

无修饰键的快捷键在输入框内不触发。

## 事件

| 事件 | 载荷 | 来源 |
| --- | --- | --- |
| `ready` / `error` | `{ instanceId }` / `{ error, source? }` | 编辑器 / 任意插件 |
| `plugin:registered` / `plugin:unregistered` | `{ name }` / `{ name, disabled? }` | 内核 |
| `command:before` / `command:after` | `{ id, args }` / `{ id, args, result }` | 内核 |
| `record:change` / `validate` / `field:focus` | | 文书著录 |
| `save`（可异步否决）/ `saved` / `save:error` | `SavePayload` / `SavePayload` / `{ error }` | 文书著录 |
| `schema:change` | `{ schema }` | 文书著录（设置 › 著录项中的修改） |
| `viewer:change` | `{ index, image }` | 影像查看 |
| `annotation:change` | `{ annotations }` | 图片标记 |

## 状态切片

| 切片 | 撤销 | 内容 |
| --- | --- | --- |
| `history` | — | `canUndo, canRedo, dirty, past[], future[]` |
| `record` | ✓ | `{ id?, values }` |
| `metadata` | | `schema, readonly, collapsed, touched, errors, validatedAt, saving, savedAt, saveError, filling` |
| `annotations` | ✓ | `{ [imageId]: { id, label, x, y, w, h }[] }` |
| `annotator` | | `labels, active, selected, hovered, tool, sizes` |
| `viewer` | | `images, index, zoom, fitScale, rotation, thumbnails, thumbSize, loading` |
| `layout` | | `sizes, collapsed, maximized, active, weights, folded, compactRegion, breakpoint, overlay` |
| `settings` | | `open, page` |
| `theme` | | `scheme, accent, density, fontSize`（持久化） |

## `@kabel/core`

| 导出 | 说明 |
| --- | --- |
| `createKernel(options)` / `Kernel` | 微内核 |
| `definePlugin` / `KabelPlugin` / `PluginContext` / `PluginInput` | 插件 |
| `createSlice` / `Store` / `Action` / `ActionMeta` | 状态 |
| `History` / `HistoryState` | 撤销/重做 |
| `EventBus` / `KabelEvents` | 事件 |
| `CommandRegistry` / `CommandDefinition` | 命令 |
| `createServiceToken` / `ServiceRegistry` | 服务 |
| `defineExtensionPoint` / `ExtensionPoints`（`toolbar` / `statusbar` / `panels` / `settings`）/ `ContributionRegistry` | 扩展点 |
| `ToolbarItem` / `StatusItem` / `PanelContribution` / `SettingsPage` / `View` / `DomView` | 贡献项类型 |
| `kernel.plugins.list / listDisabled / disable / enable / isDisabled` | 插件管理 |
| `resolveStorage` / `createMemoryStorage` / `ScopedStorage` | 存储 |
| `parseKeybinding` / `matchKeybinding` / `formatKeybinding` | 快捷键 |
| `historyPlugin()` | 撤销/重做交互入口 |
| `@kabel/core/testing`：`createTestKernel`、`setupPlugins` | 单测辅助 |

## `@kabel/ui`

| 导出 | 说明 |
| --- | --- |
| `mountWorkbench(el, kernel, { icons, class })` | 渲染工作台 |
| `Workbench` / `Region` / `PanelStack` / `Toolbar` / `StatusBar` | 外壳组件 |
| `layoutPlugin(options)` / `LAYOUT_CONFIG` / `layoutActions` | 布局插件（内置） |
| `settingsPlugin()` / `settingsActions` / `SettingsDialog` / `PluginsPage` / `pluginTree` | 设置插件（内置） |
| `themePlugin(options)` / `themeActions` / `THEME_ACCENTS` / `DEFAULT_ACCENTS` | 主题插件（内置） |
| `useKernel` / `useSelector` / `useStoreState` / `useContributions` / `useElementSize` / `useMediaQuery` / `useEvent` | hooks |
| `Button` / `IconButton` / `Tabs` / `Empty` / `Resizer` / `Section` / `ViewHost` / `Icon` / `PanelActions` | 通用组件 |
| `Input` / `Textarea` / `NumberInput` / `Select` / `RadioGroup` / `CheckboxGroup` / `Switch` / `Segmented` | 表单控件（IME 组合输入安全） |
| `cx` / `downloadFile` / `runAction` | 工具函数 |
| `@kabel/ui/style.css` / `@kabel/ui/tailwind-preset` | 样式 / Tailwind 预设 |

## 功能插件

各插件的配置、命令、服务、事件与扩展点见其 README：

- [影像查看 `@kabel/plugin-viewer`](../packages/plugin-viewer/README.md)
- [图片标记 `@kabel/plugin-annotation`](../packages/plugin-annotation/README.md)
- [文书著录 `@kabel/plugin-metadata`](../packages/plugin-metadata/README.md)
- [辅助信息 `@kabel/plugin-inspector`](../packages/plugin-inspector/README.md)
