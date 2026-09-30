# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kabel 是一个可通过 npm 集成到任意宿主页面的档案工具底座：微内核 + 插件（“一切皆插件”），原生 TS 内核，Preact 渲染层，Vue 3 适配器。底座只含工作台骨架与工作台插件（文件、内容、影像舞台），业务功能（著录、标注等）一律以插件接入，并且只依赖 `kabel:workspace`。用中文回复用户；代码注释与界面文案为中文。

## 命令

pnpm workspace（`packages/*`、`packages/plugins/*`、`examples/*`），需 pnpm ≥ 10。

```bash
pnpm install
pnpm build                     # 按依赖拓扑构建全部 packages（tsup: ESM + CJS + d.ts，再拼接 style.css）
pnpm --filter @kabel/ui build  # 构建单个包
pnpm test                      # vitest run（happy-dom），测试直接走源码，无需先 build
npx vitest run packages/plugins/workspace            # 单个包
npx vitest run packages/core/test/plugin.test.ts -t "按依赖排序"   # 单个用例
pnpm typecheck                 # 根 tsconfig 通过 paths 映射到各包 src，覆盖 packages
pnpm dev                       # Vue 示例 examples/vue-app（端口 5178）；它消费的是各包 dist，改完包源码需重新 build
(cd examples/vue-app && npx vue-tsc --noEmit)     # 示例工程类型检查
pnpm pack:all                  # 打 tarball 到 .packs/，用于在仓库外的全新项目中 npm install 验证
```

没有 lint 配置。

## 架构

依赖只能自上而下：`@kabel/vue` → `@kabel/editor`（主包，再导出所有子包）→ `plugin-workspace` → `@kabel/ui` → `@kabel/core`。`core` 不依赖任何渲染库。插件之间不 import 彼此实现，只通过**服务令牌**（`WORKSPACE_SERVICE`、`NOTIFY_SERVICE`、`LAYOUT_CONFIG`）、**扩展点**和**命令 id** 协作。

**内核（`packages/core`）**：`Kernel` 聚合 `EventBus`、`Store`、`History`、`CommandRegistry`、`ServiceRegistry`、`ExtensionRegistry`、`PluginManager`、`ScopedStorage`。
- 插件通过 `setup(ctx)` 注册一切；`ctx.*` 的注册挂在插件自己的 `DisposableStore` 上，`kernel.unuse(name)` 时逆序释放。`kernel.plugins.disable/enable` 为可恢复的停用（设置 › 插件管理使用），`builtin` 插件（布局、撤销重做、工作台、设置、主题等）为 baseline 内置：不可停用、不在插件管理中显示。新代码应始终通过 `ctx` 注册，不要直接调用底层 registry，否则卸载会有残留。
- 同步插件在 `createKernel`/`kernel.use` 返回前即已完成注册（首帧可见）；懒加载函数或异步 setup 走 Promise。依赖按拓扑排序；setup 抛错只影响该插件并派发 `error` 事件。
- 命令与贡献项同 id 后注册者生效，释放后恢复前者——这是覆盖内置行为的正式机制。
- `emitAsync` 用于可否决流程：处理器返回的 Promise 会被发起方等待。

**状态与撤销**：`createSlice({ name, reducers, history })` 生成带命名空间的 action；reducer 必须纯函数、不可变更新（返回原对象即“无变化”），reducer 内禁止 dispatch。`History` 订阅 store，只对 `history: true` 的切片做引用快照；`meta.history = { label, coalesce }` 控制记录名与合并，`false` 表示不入栈。历史状态本身存在 `state.history`（含 `dirty`，基于 `markSaved` 保存点）。底座自带切片（`documents`、`stage`、`mode`、`save`、`keymap`、`layout`、`settings`、`theme` 等）都不纳入撤销，业务状态由功能插件自行声明。

**类型扩充**：插件用 `declare module '@kabel/core'`（或 `'@kabel/editor'`）扩充 `KabelState` / `KabelEvents`。`history` 字段直接写在 `store.ts` 的 `KabelState` 中（包内相对路径的模块扩充在 tsup 打包 d.ts 时不可靠）。

**渲染层（`packages/ui`）**：`Workbench` 渲染五段式骨架——顶部工具栏、中间左侧扩展面板、中间内容、中间右侧扩展面板、底部状态栏；内容全部来自扩展点 `ExtensionPoints.toolbar | statusbar | panels`。左右两侧是**通用扩展区域**，不预设用途，区域内没有面板时整个区域不渲染（对应的工具栏开关按钮也隐藏）；设置弹窗的分类页来自 `ExtensionPoints.settings`（`settings/`），主题插件把 `state.theme` 转为根节点的 `data-scheme` / `data-density` / `--kb-accent`（`theme/`、`styles/themes.css`）。
- 视图类型 `View<P>` = Preact 函数组件 或 `DomView`（`mount(el, props) → { update, unmount }`）；Vue 通过 `vueView()`（继承宿主 appContext）或 `<KabelPanel>`（Teleport 到 DomView 提供的容器）接入。因此面板在切换标签、折叠、最大化时必须**保持挂载只隐藏**，否则 Teleport/DomView 内容会丢失。
- `useSelector` 精确订阅。
- 布局状态在 `layout` 切片（`layout-plugin.ts`），持久化键 `kabel:<instanceId>:kabel:layout:state.v1`，读取经 `sanitize`。断点按**容器宽度**计算并回写到 `layout.breakpoint`（不持久化）：`md` 下右栏变为浮层（`overlay`），命令据此决定“收起”还是“关浮层”，区域收起状态统一用 `isRegionCollapsed()` 判断。区域名称（`RegionConfig.title`，默认“左侧面板 / 内容 / 右侧面板”）只用于折叠条与提示；区域内仅一个面板时改用该面板标题。
- 快捷键是 document 级监听（浮层如命令面板、确认框自行处理按键并 `preventDefault`，全局监听遇到 `defaultPrevented` 会跳过），但只在事件目标位于工作台内、或焦点在 body 且最近一次交互在工作台内时处理（WebKit 点击按钮不获焦点）。

**baseline**：内置插件（`builtin`）= 布局、撤销重做、只读（`kabel:mode`）、保存（`kabel:save`）、消息与对话框（`kabel:feedback`）、快捷键（`kabel:keymap`）、右键菜单（`kabel:contextmenu`）、命令面板（`kabel:palette`）、工作台（`kabel:workspace`）、设置、主题，由 `createBaselinePreset` 组装。`mode` / `save` 在 core（无渲染依赖，可在 core 内直接扩充 `KabelState`），工作台在 `packages/plugins/workspace`，其余在 ui。默认布局：左侧“文件目录”（`workspace.files`）、中间“内容”（`workspace.content`）、右侧无面板。面板定位统一走 `layout.showPanel` 命令。

- **工作台是业务插件的底座**：`state.documents = { items, index, loading }` 是“当前打开的文件”的唯一来源、`state.stage` 是影像舞台状态，`WORKSPACE_SERVICE` 读写；内容面板按 `kind` 从 `WorkspaceExtensions.renderers` 选渲染器；文件目录、页码状态栏、`document:change` 事件都归工作台。业务插件只声明 `dependencies: ['kabel:workspace']`，不 import 其他业务插件；ui 不得依赖工作台（依赖方向 workspace → ui）。目录、内容面板、影像渲染器都是普通贡献项，同 id 贡献即可替换。
- **命令标记**：`CommandDefinition.mutates`（只读模式下由 `CommandRegistry.isEnabled` 统一禁用）、`hidden`（不进命令面板与快捷键设置；需要参数的命令必须标）。快捷键的生效值一律用 `commandBindings(command, state)`（含用户改绑），不要直接读 `command.keybinding`。
- **保存契约**：`kabel.save` → `emitAsync('save')` → `history.markSaved()` → `saved`；失败派发 `save:error` 并通过 `NOTIFY_SERVICE` 提示。业务插件在 `save` 事件里实现具体保存，不要另起保存流程。
- **右键菜单**：元素加 `data-kb-context`（可选 `data-kb-context-data`），菜单项来自扩展点 `ExtensionPoints.contextMenu`；没有匹配项时不拦截浏览器原生菜单。
- **错误隔离**：`ViewHost` 内含错误边界，所有面板 / 工具栏 / 覆盖层视图经它渲染；新增渲染入口时同样要走 `ViewHost`。

**工作台的影像部分（`plugin-workspace`）**：`resolveImage` 将 URL / 纯 base64 / Blob / 二进制 / 对象归一化为 `ImageItem`（状态中只存字符串）；为 Blob 创建的 object URL 由插件跟踪并在替换/卸载时释放，并发 `setImages` 用 generation 计数取最后一次。对外开放扩展点 `WorkspaceExtensions.overlays`（覆盖层，`toScreen`/`toImage` 坐标换算）与 `WorkspaceExtensions.tools`（侧边工具条），功能插件不应修改工作台内部。

## 约定

- 样式：纯 CSS，全部限定在 `.kb-root` 下、类名 `kb-` 前缀，颜色尺寸用 `tokens.css` 中的 `--kb-*` 变量。各包 CSS 源在 `src/style.css`（ui 为 `src/styles/*.css`），构建时由 `scripts/build-css.mjs` 拼接；`@kabel/editor` 的 style.css 汇总所有包，`@kabel/vue` 复制它。新增 CSS 文件需同步更新对应 package.json 的 build 脚本。
- 图标：iconfont Symbol 格式，内置集合在 `packages/ui/src/icons/sprite.ts`（24×24 线性 path），贡献项用名称引用。
- 视觉风格：企业/政务档案风格，克制、密度适中；不要加大标题、副标题、灰色描述/提示文本。
- JSX：`jsxImportSource: preact`，属性用 `class`。
- 插件单测用 `@kabel/core/testing` 的 `setupPlugins()`（内存存储）；需要 DOM 时用 `render(<Workbench kernel={kernel} />, el)` + `preact/test-utils` 的 `act`。
- 每个包（`packages/*`）与每个扩展插件（`packages/plugins/<name>`）都有 README.md，说明功能、集成方式、配置、命令、服务、事件；改动对外行为时同步更新其 README 与 `docs/`。
- **扩展插件统一放在 `packages/plugins/<name>/`**（包名 `@kabel/plugin-<name>`，模板与接入清单见 `packages/plugins/README.md`）；内置的工作台也在此目录（`packages/plugins/workspace`）。vitest 别名、tsconfig paths、`pack-all` 已按此目录配置，新增插件无需改根配置；带 CSS 的插件需把 `src/style.css` 追加到 `packages/editor/package.json` 的 build 脚本。
- 功能设计前置：任何功能在设计之前，都必须先参考 dsh（deepseek-harness）“一切皆插件”的设计理念，并对照 cordis 的插件/服务/上下文（Context）模型，确认功能是否应以插件形式接入、依赖哪些服务与扩展点，再动手设计与实现。参考文档：
  - https://github.com/deepseek-ai/deepseek-harness
  - https://github.com/cordiverse/cordis
