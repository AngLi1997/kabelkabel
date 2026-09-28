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
| `preset` | 替换 baseline；`false` 不使用预设 |
| `layout` | `LayoutOptions` |
| `metadata` | `{ allowInvalidSave?, panel? }` |
| `viewer` | `{ thumbnails?, panel?, urlFactory? } \| false` |
| `inspector` | `{ panels?: ('validation' \| 'history')[] } \| false` |
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
| `getState() / subscribe(fn)` | 状态 |
| `getRecord() / setRecord(r)` | 档案；`setRecord` 会清空撤销栈并标记已保存 |
| `getValues() / setValue(k, v, label?) / setValues(obj, label?)` | 著录值（进入撤销栈） |
| `setSchema(s) / setImages(list) / setReadonly(b)` | |
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
| 对象 | `{ id?, name?, url? \| src? \| base64? \| blob? \| file? \| data?, mime?, thumbnail? }` |
| 异步加载器 | `async () => (await fetch(url, { headers })).blob()` |

为 Blob / 二进制创建的 object URL 在替换影像或卸载插件时自动释放；并发 `setImages` 以最后一次为准。

## 命令一览

| 命令 | 参数 | 说明 |
| --- | --- | --- |
| `kabel.save` | | 校验 → `emitAsync('save')` → 标记已保存（`Mod+S`） |
| `kabel.undo` / `kabel.redo` | | `Mod+Z` / `Mod+Shift+Z`、`Mod+Y` |
| `metadata.validate` | | 整体校验 |
| `metadata.focusField` | `key` | 定位字段（自动展开分组、显示区域） |
| `metadata.focusFirstError` | | |
| `metadata.toggleAllGroups` | | |
| `viewer.prev / next / goto` | `goto(index)` | 翻页 |
| `viewer.zoomIn / zoomOut / fit / actual` | | 缩放 |
| `viewer.rotateLeft / rotateRight` | | 旋转 |
| `viewer.toggleThumbnails` | | |
| `layout.toggleLeft / toggleRight` | `collapsed?: boolean` | |
| `layout.maximize` | `region` | 切换最大化 |
| `layout.restore` | | `Escape` |
| `layout.reveal` | `region` | 确保区域可见 |
| `layout.reset` | | 重置布局 |

## 状态切片

| 切片 | 撤销 | 内容 |
| --- | --- | --- |
| `history` | — | `canUndo, canRedo, dirty, past[], future[]` |
| `record` | ✓ | `{ id?, values }` |
| `metadata` | | `schema, readonly, collapsed, touched, errors, validatedAt, saving, savedAt, saveError` |
| `viewer` | | `images, index, zoom, fitScale, rotation, thumbnails, thumbSize, loading` |
| `layout` | | `sizes, collapsed, maximized, active, weights, folded, compactRegion, breakpoint, overlay` |

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
| `defineExtensionPoint` / `ExtensionPoints` / `ContributionRegistry` | 扩展点 |
| `ToolbarItem` / `StatusItem` / `PanelContribution` / `View` / `DomView` | 贡献项类型 |
| `resolveStorage` / `createMemoryStorage` / `ScopedStorage` | 存储 |
| `parseKeybinding` / `matchKeybinding` / `formatKeybinding` | 快捷键 |
| `historyPlugin()` | 撤销/重做交互入口 |
| `@kabel/core/testing`：`createTestKernel`、`setupPlugins` | 单测辅助 |

## `@kabel/ui`

| 导出 | 说明 |
| --- | --- |
| `mountWorkbench(el, kernel, { icons, class })` | 渲染工作台 |
| `Workbench` / `Region` / `PanelStack` / `Toolbar` / `StatusBar` | 外壳组件 |
| `layoutPlugin(options)` / `LAYOUT_CONFIG` / `layoutActions` | 布局插件 |
| `useKernel` / `useSelector` / `useContributions` / `useElementSize` | hooks |
| `Button` / `IconButton` / `Tabs` / `Empty` / `Resizer` / `Section` / `ViewHost` / `Icon` | 通用组件 |
| `Input` / `Textarea` / `NumberInput` / `Select` / `RadioGroup` / `CheckboxGroup` | 表单控件（IME 组合输入安全） |
| `@kabel/ui/style.css` / `@kabel/ui/tailwind-preset` | 样式 / Tailwind 预设 |
