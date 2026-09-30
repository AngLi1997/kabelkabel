# API 参考

## `createArchiveEditor(target, options)` — `@kabel/editor`

`target`：元素或选择器。返回 `ArchiveEditor`。

### `EditorOptions`

| 选项 | 说明 |
| --- | --- |
| `images` | 当前打开的文件 `ImageSourceInput[]`，显示在左侧文件目录与内容区域 |
| `readonly` | 初始只读：声明了 `mutates` 的命令（保存、撤销、重做…）被禁用 |
| `save` | 保存契约：`{ confirmLeave? }`；`false` 关闭（同时没有 `Mod+S`、保存按钮与离开确认） |
| `plugins` | 追加插件 |
| `preset` | 替换 baseline；`false` 不使用预设（baseline 组成见 [架构设计](architecture.md#baseline-与插件分类)） |
| `layout` | `LayoutOptions` |
| `workspace` | 工作台，见 [plugin-workspace](../packages/plugins/workspace/README.md)：`{ items?, thumbnails?, directory?, content?, urlFactory? } \| false`；`directory: false` 不注册文件目录；`false` 整个工作台不注册（没有文件目录与内容） |
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
| `setImages(list) / getImages()` | 打开一组影像（写入文档模型）/ 读取当前影像 |
| `setDocuments(items) / getDocuments() / getCurrentDocument() / goto(index)` | 直接操作文档模型（已解析的 `DocumentItem`，用于非图片类型） |
| `save()` | 依次等待 `save` 事件处理器，成功后标记为已保存：`Promise<{ ok: true } \| { ok: false, error? }>` |
| `setReadonly(b) / isReadonly()` | 只读模式 |
| `notify(message, { type?, duration? }) / confirm(options)` | 消息提示 / 确认对话框（`Promise<boolean>`） |
| `undo() / redo() / isDirty()` | |
| `layout.collapse/expand/toggle(region)` | `'left' \| 'right'` |
| `layout.maximize(region) / restore() / reset()` | |
| `destroy()` | 卸载并释放所有插件 |

### `ImageSourceInput`

| 形式 | 示例 |
| --- | --- |
| URL | `'https://…/0001.jpg'`、`'/scans/1.jpg'`、`'data:image/png;base64,…'`、`'blob:…'` |
| 纯 base64 | `'iVBORw0KGgo…'`（根据文件头识别 jpeg/png/gif/webp/bmp/svg） |
| Blob / File | `file` |
| 二进制 | `ArrayBuffer`、`Uint8Array`（根据字节头识别 MIME） |
| 对象 | `{ id?, name?, group?, url? \| src? \| base64? \| blob? \| file? \| data?, mime?, thumbnail? }` |
| 异步加载器 | `async () => (await fetch(url, { headers })).blob()` |

影像对象可带 `group`（所属目录，如“正文”“附件”）：文件目录按目录分组、可折叠，页码与状态栏显示目录内位置。

为 Blob / 二进制创建的 object URL 在替换影像或卸载插件时自动释放；并发 `setImages` 以最后一次为准。

## 命令一览

| 命令 | 参数 / 快捷键 | 说明 |
| --- | --- | --- |
| `kabel.save` | `Mod+S` | 保存契约：等待 `save` 事件处理器 → 标记已保存 → `saved`；失败 → `save:error` 并提示 |
| `kabel.undo` / `kabel.redo` | `Mod+Z` / `Mod+Shift+Z`、`Mod+Y` | 只读时禁用 |
| `palette.open` | `Mod+Shift+P` | 命令面板（macOS ⌘⇧P，其他平台 Ctrl+Shift+P） |
| `workspace.prev / next / goto` | `goto(index)` | 切换当前文件 |
| `kabel.setReadonly` | `readonly?: boolean` | 切换只读（不带参数为取反） |
| `workspace.prev / next / goto` | `goto(index)` | 切换当前文件 |
| `workspace.zoomIn / zoomOut / fit / actual` | | 缩放（当前文件是影像时可用） |
| `workspace.rotateLeft / rotateRight` | | 旋转 |
| `workspace.toggleThumbnails` | | 缩略图开关 |
| `layout.toggleLeft / toggleRight` | `collapsed?: boolean` | |
| `layout.maximize` | `region` | 切换最大化 |
| `layout.restore` | `Escape` | |
| `layout.reveal` | `region` | 确保区域可见 |
| `layout.showPanel` | `panelId` | 显示面板所在区域并激活其标签 |
| `layout.reset` | | 重置布局 |
| `settings.open` / `settings.close` | `pageId?` | 打开设置（`plugins` / `shortcuts` / `theme`） |
| `theme.set` / `theme.reset` | `Partial<ThemeState>` | 修改 / 恢复主题 |

无修饰键的快捷键在输入框内不触发。用户可在 设置 › 快捷键 中改绑（持久化）；命令声明 `hidden: true` 后不出现在命令面板与快捷键设置中，声明 `mutates: true` 后只读时自动禁用。

## 事件

| 事件 | 载荷 | 来源 |
| --- | --- | --- |
| `ready` / `error` | `{ instanceId }` / `{ error, source? }` | 编辑器 / 任意插件 |
| `plugin:registered` / `plugin:unregistered` | `{ name }` / `{ name, disabled? }` | 内核 |
| `command:before` / `command:after` | `{ id, args }` / `{ id, args, result }` | 内核 |
| `document:change` | `{ index, document }` | 工作台（当前文件变化） |
| `save`（可异步否决）/ `saved` / `save:error` | `{ reason? }` / `{ reason? }` / `{ error }` | 保存契约 |
| `mode:change` | `{ readonly }` | 只读模式 |

## 状态切片

| 切片 | 撤销 | 内容 |
| --- | --- | --- |
| `history` | — | `canUndo, canRedo, dirty, past[], future[]` |
| `documents` | | `items, index, loading` |
| `stage` | | `zoom, fitScale, rotation, thumbnails, thumbSize`（影像舞台） |
| `mode` | | `readonly` |
| `save` | | `saving, savedAt, error` |
| `feedback` | | `toasts, confirm` |
| `keymap` | | `overrides`（命令 id → 快捷键列表，持久化） |
| `palette` / `contextmenu` | | 命令面板 / 右键菜单的打开状态 |
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
| `CommandRegistry` / `CommandDefinition`（`mutates`、`hidden`） | 命令 |
| `createServiceToken` / `ServiceRegistry` | 服务 |
| `defineExtensionPoint` / `ExtensionPoints`（`toolbar` / `statusbar` / `panels` / `settings` / `contextMenu`）/ `ContributionRegistry` | 扩展点 |
| `ToolbarItem` / `StatusItem` / `PanelContribution` / `SettingsPage` / `ContextMenuItem` / `View` / `DomView` | 贡献项类型 |
| `modePlugin` / `isReadonly` | 只读模式（内置） |
| `savePlugin` / `SaveResult` | 保存契约（内置） |
| `NOTIFY_SERVICE` / `NotifyService` | 消息与确认对话框的服务令牌（实现在 ui 的 `feedbackPlugin`） |
| `eventToKeybinding` / `sameKeybinding` | 快捷键工具 |
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
| `feedbackPlugin()` | 消息提示与确认对话框（内置） |
| `palettePlugin()` | 命令面板（内置） |
| `keymapPlugin()` / `keymapActions` / `commandBindings` / `findConflicts` | 快捷键改绑与冲突检测（内置） |
| `contextMenuPlugin()` | 右键菜单（内置，菜单项来自 `ExtensionPoints.contextMenu`） |
| `themePlugin(options)` / `themeActions` / `THEME_ACCENTS` / `DEFAULT_ACCENTS` | 主题插件（内置） |
| `useKernel` / `useSelector` / `useReadonly` / `useStoreState` / `useContributions` / `useElementSize` / `useMediaQuery` / `useEvent` | hooks |
| `Button` / `IconButton` / `Tabs` / `Empty` / `Resizer` / `Section` / `ViewHost` / `Icon` / `PanelActions` | 通用组件 |
| `Input` / `Textarea` / `NumberInput` / `Select` / `RadioGroup` / `CheckboxGroup` / `Switch` / `Segmented` | 表单控件（IME 组合输入安全），供功能插件复用 |
| `cx` / `downloadFile` / `runAction` | 工具函数 |
| `@kabel/ui/style.css` / `@kabel/ui/tailwind-preset` | 样式 / Tailwind 预设 |

## `@kabel/plugin-workspace`

| 导出 | 说明 |
| --- | --- |
| `workspacePlugin(options)` / `WORKSPACE_PLUGIN` | 工作台插件（内置）：文档模型、文件目录、内容面板、影像舞台 |
| `WORKSPACE_SERVICE` / `WorkspaceService` | `setImages / setDocuments / getDocuments / getImages / current / goto / setLoading / getStage` |
| `WorkspaceExtensions` | 扩展点：`renderers`（文件渲染器）、`overlays`（舞台覆盖层）、`tools`（舞台工具条） |
| `DocumentItem` / `DocumentRenderer` / `StageOverlayProps` / `StageTool` | 类型 |
| `useDocuments` / `useCurrentDocument` / `useStage` | hooks |
| `groupDocuments` / `documentPosition` / `documentsActions` / `stageActions` | 文件分组与位置、状态动作 |
| `resolveImage` / `ImageSourceInput` / `ImageItem` | 图片来源解析与类型 |
| `FileList` / `ContentPanel` / `ImageRenderer` | 内置视图，可单独复用 |

## 内置与功能插件

底座只内置布局、撤销重做、工作台、设置、主题等公共能力；其余功能以插件形式提供（见[插件开发指南](plugin-guide.md)）。工作台的配置、命令、服务、事件与扩展点见其 README：

- [工作台 `@kabel/plugin-workspace`](../packages/plugins/workspace/README.md)
