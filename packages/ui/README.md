# @kabel/ui · 渲染层

基于 Preact 的工作台外壳、内置插件、通用组件、图标与样式。依赖 `@kabel/core`；插件贡献的视图可以是 Preact 组件，也可以是任意技术栈的 `DomView`（Vue 见 `@kabel/vue`）。

## 工作台

```ts
import { createKernel } from '@kabel/core';
import { mountWorkbench, layoutPlugin } from '@kabel/ui';
import '@kabel/ui/style.css';

const kernel = createKernel({ plugins: [layoutPlugin(), myPanelPlugin] });   // 内容由插件通过扩展点贡献
const unmount = mountWorkbench(el, kernel, { icons: {}, class: 'my-host' });
```

`Workbench` 渲染五段式骨架：顶部工具栏、中间左侧扩展面板、内容、中间右侧扩展面板、底部状态栏，内容全部来自扩展点 `toolbar` / `statusbar` / `panels`。左右两侧没有预设用途，区域内没有面板时不渲染。按容器宽度响应式（`lg` 三栏 / `md` 右栏浮层 / `sm` 单栏切换）。

## 内置插件

| 插件 | 名称 | 说明 |
| --- | --- | --- |
| `layoutPlugin({ regions?, persist? })` | `kabel:layout` | 区域尺寸、折叠、最大化、标签 / 堆叠模式及其持久化 |
| `feedbackPlugin()` | `kabel:feedback` | 消息提示与确认对话框（实现 `NOTIFY_SERVICE`） |
| `keymapPlugin()` | `kabel:keymap` | 快捷键改绑（持久化）、冲突检测、设置 › 快捷键 |
| `contextMenuPlugin()` | `kabel:contextmenu` | 右键菜单：`data-kb-context` 标识区域，菜单项来自扩展点 `ExtensionPoints.contextMenu` |
| `palettePlugin()` | `kabel:palette` | 命令面板 `Mod+Shift+P` |
| `settingsPlugin()` | `kabel:settings` | 设置弹窗，分类页来自扩展点 `ExtensionPoints.settings`，内置插件管理 |
| `themePlugin({ defaults?, accents?, persist? })` | `kabel:theme` | 浅色 / 深色 / 跟随系统、主题色、界面密度、字号 |
| `logsPlugin({ capacity?, format?, actions?, rules? })` | `kabel:logs` | 事件日志（非 builtin，可在插件管理中停用与配置），见下文 |

文件目录、内容面板、影像等**内容**不在 ui 中，由 [`@kabel/plugin-workspace`](../plugins/workspace/README.md) 通过扩展点贡献；ui 只提供外壳与通用能力，所以整个界面都可以由插件定义。

除 `logsPlugin` 外均为 `builtin`：不可在运行期停用，也不出现在插件管理中。通常由 `@kabel/editor` 的 `createBaselinePreset` 组装。

## 事件日志（`kabel:logs`）

- 状态栏右下角“日志”按钮（显示条数，有未查看的错误时标红）或 `Mod+Shift+L` 展开 / 收起**最右侧的日志看板**（扩展点 `ExtensionPoints.drawers`，宽屏时为右侧扩展区域之外的一栏，可拖动调整宽度；中窄屏为浮层）。
- 记录每个事件的时间戳、来源插件、事件名、显示名称、级别、摘要与载荷（长字符串、二进制已截断）。插件经 `ctx.bus` / `ctx.emit` 派发的事件自动标注来源，命令执行（`command:after` / `command:error`）、插件启停与配置、服务变化默认都会记录——所有组件无需额外代码。
- 看板可按关键字、级别、来源筛选，暂停、清空，下载为文本（.log）/ CSV / JSON（有筛选时下载筛选结果）。
- **事件规则**（设置 › 插件管理 › 事件日志 › 配置）：按事件名匹配（支持 `*` 通配，第一条匹配生效），可修改显示名称、级别、是否记录，或**转发为自定义事件**（载荷与来源不变，宿主可 `editor.on('自定义名称', …)` 监听）。
- 配置项：`capacity`（最多保留条数，默认 2000）、`format`（下载格式）、`actions`（是否记录状态变更 action，默认否）、`rules`。
- 命令：`logs.toggle`、`logs.clear`、`logs.download`、`logs.pause`；服务 `LOG_SERVICE`。

## 弹窗

所有弹窗（设置、确认框、命令面板、插件弹窗）可拖动：用 `useDraggable(ref)`，把 `handleProps` 展开到头部，`style` 应用到弹窗；位置限制在遮罩层内，拖动柄内的按钮、输入框不触发拖动。设置弹窗还可拖动右下角调整大小，双击头部复位；插件管理表格固定列宽、超长内容省略（悬停显示全文），窄时自动隐藏“标识”“依赖”列。

## 组件与 hooks

- 外壳：`Workbench`、`Region`、`PanelStack`、`Toolbar`、`StatusBar`、`Drawers`、`SettingsDialog`
- 通用：`Button` / `IconButton`、`Tabs`、`Empty`、`Resizer`、`Section`、`Icon`、`PanelActions`、`ViewHost`（内含错误边界，所有视图都应经它渲染）
- 表单：`Input`、`Textarea`、`NumberInput`、`Select`、`RadioGroup`、`CheckboxGroup`、`Switch`、`Segmented`（输入法组合输入安全）
- hooks：`useDraggable`（弹窗拖动）、`useLogRecorder`、`useKernel`、`useSelector`（精确订阅）、`useStoreState`、`useContributions`、`useReadonly`、`useElementSize`、`useMediaQuery`、`useEvent`
- 工具：`cx`、`downloadFile`、`runAction`、`commandBindings`（含用户改绑的快捷键）

## 样式与图标

- 纯 CSS，全部作用于 `.kb-root` 下，类名 `kb-` 前缀，颜色与尺寸用 `--kb-*` 变量（`tokens.css`），引入 `@kabel/ui/style.css`。也提供 Tailwind 预设：`@kabel/ui/tailwind-preset`。
- 图标为 iconfont Symbol 格式，内置一组 24×24 线性图标，可整体替换为宿主的 iconfont 项目（Symbol 或 Font class），见 [主题、样式与图标](../../docs/theming.md)。
- 构建：`pnpm --filter @kabel/ui build`（tsup + 拼接 `src/styles/*.css`）。新增 CSS 文件需同步更新本包与 `@kabel/editor` 的 build 脚本。

## 相关文档

- [架构设计](../../docs/architecture.md)
- [插件开发指南](../../docs/plugin-guide.md)
- [主题、样式与图标](../../docs/theming.md)
