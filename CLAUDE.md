# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kabel 是一个可通过 npm 集成到任意宿主页面的档案著录工具：微内核 + 插件（“一切皆插件”），原生 TS 内核，Preact 渲染层，Vue 3 适配器。用中文回复用户；代码注释与界面文案为中文。

## 命令

pnpm workspace（`packages/*`、`examples/*`），需 pnpm ≥ 10。

```bash
pnpm install
pnpm build                     # 按依赖拓扑构建全部 packages（tsup: ESM + CJS + d.ts，再拼接 style.css）
pnpm --filter @kabel/ui build  # 构建单个包
pnpm test                      # vitest run（happy-dom），测试直接走源码，无需先 build
npx vitest run packages/plugin-viewer              # 单个包
npx vitest run packages/core/test/plugin.test.ts -t "按依赖排序"   # 单个用例
pnpm typecheck                 # 根 tsconfig 通过 paths 映射到各包 src，覆盖 packages 与 examples/plugins
pnpm dev                       # Vue 示例 examples/vue-app（端口 5178）；它消费的是各包 dist，改完包源码需重新 build
(cd examples/vue-app && npx vue-tsc --noEmit)     # 示例工程类型检查
pnpm pack:all                  # 打 tarball 到 .packs/，用于在仓库外的全新项目中 npm install 验证
```

没有 lint 配置。

## 架构

依赖只能自上而下：`@kabel/vue` → `@kabel/editor`（主包，再导出所有子包）→ `plugin-metadata` / `plugin-viewer` / `plugin-inspector`（依赖 metadata）/ `plugin-annotation`（依赖 viewer）→ `@kabel/ui` → `@kabel/core`。`core` 不依赖任何渲染库。插件之间不 import 彼此实现，只通过**服务令牌**（`METADATA_SERVICE`、`VIEWER_SERVICE`、`ANNOTATION_SERVICE`、`LAYOUT_CONFIG`）、**扩展点**和**命令 id** 协作。

**内核（`packages/core`）**：`Kernel` 聚合 `EventBus`、`Store`、`History`、`CommandRegistry`、`ServiceRegistry`、`ExtensionRegistry`、`PluginManager`、`ScopedStorage`。
- 插件通过 `setup(ctx)` 注册一切；`ctx.*` 的注册挂在插件自己的 `DisposableStore` 上，`kernel.unuse(name)` 时逆序释放。`kernel.plugins.disable/enable` 为可恢复的停用（设置 › 插件管理使用），`builtin` 插件（布局、撤销重做、影像查看、设置、主题）为 baseline 内置：不可停用、不在插件管理中显示。新代码应始终通过 `ctx` 注册，不要直接调用底层 registry，否则卸载会有残留。
- 同步插件在 `createKernel`/`kernel.use` 返回前即已完成注册（首帧可见）；懒加载函数或异步 setup 走 Promise。依赖按拓扑排序；setup 抛错只影响该插件并派发 `error` 事件。
- 命令与贡献项同 id 后注册者生效，释放后恢复前者——这是覆盖内置行为的正式机制。
- `emitAsync` 用于可否决流程：`save` 事件处理器返回的 Promise 会被 `kabel.save` 命令等待。

**状态与撤销**：`createSlice({ name, reducers, history })` 生成带命名空间的 action；reducer 必须纯函数、不可变更新（返回原对象即“无变化”），reducer 内禁止 dispatch。`History` 订阅 store，只对 `history: true` 的切片做引用快照；`meta.history = { label, coalesce }` 控制记录名与合并，`false` 表示不入栈。历史状态本身存在 `state.history`（含 `dirty`，基于 `markSaved` 保存点）。baseline 中 `record`、`annotations` 切片纳入撤销；`metadata`、`viewer`、`annotator`、`layout`、`settings`、`theme` 不纳入。

**类型扩充**：插件用 `declare module '@kabel/core'`（或 `'@kabel/editor'`）扩充 `KabelState` / `KabelEvents`。`history` 字段直接写在 `store.ts` 的 `KabelState` 中（包内相对路径的模块扩充在 tsup 打包 d.ts 时不可靠）。

**渲染层（`packages/ui`）**：`Workbench` 渲染工具栏 / 左中右三个 `Region` / 状态栏，内容全部来自扩展点 `ExtensionPoints.toolbar | statusbar | panels`；设置弹窗的分类页来自 `ExtensionPoints.settings`（`settings/`），主题插件把 `state.theme` 转为根节点的 `data-scheme` / `data-density` / `--kb-accent`（`theme/`、`styles/themes.css`）。
- 视图类型 `View<P>` = Preact 函数组件 或 `DomView`（`mount(el, props) → { update, unmount }`）；Vue 通过 `vueView()`（继承宿主 appContext）或 `<KabelPanel>`（Teleport 到 DomView 提供的容器）接入。因此面板在切换标签、折叠、最大化时必须**保持挂载只隐藏**，否则 Teleport/DomView 内容会丢失。
- `useSelector` 精确订阅；表单字段各自订阅 `s.record.values[key]`。
- 布局状态在 `layout` 切片（`layout-plugin.ts`），持久化键 `kabel:<instanceId>:kabel:layout:state.v1`，读取经 `sanitize`。断点按**容器宽度**计算并回写到 `layout.breakpoint`（不持久化）：`md` 下右栏变为浮层（`overlay`），命令据此决定“收起”还是“关浮层”，区域收起状态统一用 `isRegionCollapsed()` 判断。
- 快捷键是 document 级监听，但只在事件目标位于工作台内、或焦点在 body 且最近一次交互在工作台内时处理（WebKit 点击按钮不获焦点）。

**文书著录（`plugin-metadata`，原“元数据编辑器”）**：面板在右侧，顶部自带工具条（AI 填充 `metadata.aiFill` 由 `aiFill` 选项提供实现、元数据设置打开设置 › 著录项），不用区域标题栏的 `actions`，避免与右侧多个标签页争抢空间。设置 › 著录项可切换必填/显示、导入导出 Schema，修改派发 `schema:change`。`normalizeSchema` / `normalizeRecord` 负责多种输入格式归一化；字段类型是扩展点 `FieldTypes`（字段视图必须把 `id` 放到可聚焦元素上，`focusField` 依赖 `fieldDomId(kernel.id, key)`）。错误只对 touched 字段展示，执行过整体校验（`validatedAt`）后展示全部。

**布局与 baseline**：baseline = 内置插件（`builtin`：布局、撤销重做、影像查看、设置、主题）+ 图片标记；文书著录与辅助信息为可选插件。影像在中间区域；右侧为标签页（标记 / 著录信息 / 校验结果 / 操作记录）；左侧留给宿主面板。设置 › 插件管理用 `pluginTree()` 按依赖关系排成树形列表（隐藏 builtin）。`createArchiveEditor` 仅在传入 `schema`/`record`/`metadata` 时启用，元数据 API 用 `tryGet` 降级。面板定位统一走 `layout.showPanel` 命令。

**图片标记（`plugin-annotation`）**：通过 viewer 的 `ViewerExtensions.overlays`（覆盖层，`toScreen`/`toImage` 坐标换算）和 `ViewerExtensions.tools` 接入，不修改 viewer 内部。标记以图片 id 为键、坐标为图片原始像素；影像列表替换时清空（`setAnnotations` 在加载期间提交的会在就绪后载入）。拖拽中的预览用 ref + state，松开时只 dispatch 一次入历史。YOLO 需要图片尺寸，来自覆盖层回写的 `annotator.sizes`。

**影像查看**：`resolveImage` 将 URL / 纯 base64 / Blob / 二进制 / 对象归一化为 `ImageItem`（状态中只存字符串）；为 Blob 创建的 object URL 由插件跟踪并在替换/卸载时释放，并发 `setImages` 用 generation 计数取最后一次。

## 约定

- 样式：纯 CSS，全部限定在 `.kb-root` 下、类名 `kb-` 前缀，颜色尺寸用 `tokens.css` 中的 `--kb-*` 变量。各包 CSS 源在 `src/style.css`（ui 为 `src/styles/*.css`），构建时由 `scripts/build-css.mjs` 拼接；`@kabel/editor` 的 style.css 汇总所有包，`@kabel/vue` 复制它。新增 CSS 文件需同步更新对应 package.json 的 build 脚本。
- 图标：iconfont Symbol 格式，内置集合在 `packages/ui/src/icons/sprite.ts`（24×24 线性 path），贡献项用名称引用。
- 视觉风格：企业/政务档案风格，克制、密度适中；不要加大标题、副标题、灰色描述/提示文本。
- JSX：`jsxImportSource: preact`，属性用 `class`。
- 插件单测用 `@kabel/core/testing` 的 `setupPlugins()`（内存存储）；需要 DOM 时用 `render(<Workbench kernel={kernel} />, el)` + `preact/test-utils` 的 `act`。
- 每个插件目录（`packages/plugin-*`、`examples/plugins/<name>`）都有 README.md，说明功能、集成方式、配置、命令、服务、事件；改动插件的对外行为时同步更新其 README 与 `docs/`。
- `examples/plugins` 是独立 workspace 包（`@kabel-examples/plugins`，直接导出 .ts 源码），演示第三方插件分发形态：每个插件一个目录 `<name>/{README.md, src/index.ts, src/plugin.ts, test/}`，在 package.json `exports` 中以 `./<name>` 子路径导出；Kabel 依赖写在 peerDependencies（开发用 devDependencies 的 `workspace:*`）。其测试被根 vitest 包含。
