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

依赖只能自上而下：`@kabel/vue` → `@kabel/editor`（主包，再导出所有子包）→ `plugin-metadata` / `plugin-viewer` / `plugin-inspector`（inspector 依赖 metadata）→ `@kabel/ui` → `@kabel/core`。`core` 不依赖任何渲染库。插件之间不 import 彼此实现，只通过**服务令牌**（`METADATA_SERVICE`、`VIEWER_SERVICE`、`LAYOUT_CONFIG`）、**扩展点**和**命令 id** 协作。

**内核（`packages/core`）**：`Kernel` 聚合 `EventBus`、`Store`、`History`、`CommandRegistry`、`ServiceRegistry`、`ExtensionRegistry`、`PluginManager`、`ScopedStorage`。
- 插件通过 `setup(ctx)` 注册一切；`ctx.*` 的注册挂在插件自己的 `DisposableStore` 上，`kernel.unuse(name)` 时逆序释放。新代码应始终通过 `ctx` 注册，不要直接调用底层 registry，否则卸载会有残留。
- 同步插件在 `createKernel`/`kernel.use` 返回前即已完成注册（首帧可见）；懒加载函数或异步 setup 走 Promise。依赖按拓扑排序；setup 抛错只影响该插件并派发 `error` 事件。
- 命令与贡献项同 id 后注册者生效，释放后恢复前者——这是覆盖内置行为的正式机制。
- `emitAsync` 用于可否决流程：`save` 事件处理器返回的 Promise 会被 `kabel.save` 命令等待。

**状态与撤销**：`createSlice({ name, reducers, history })` 生成带命名空间的 action；reducer 必须纯函数、不可变更新（返回原对象即“无变化”），reducer 内禁止 dispatch。`History` 订阅 store，只对 `history: true` 的切片做引用快照；`meta.history = { label, coalesce }` 控制记录名与合并，`false` 表示不入栈。历史状态本身存在 `state.history`（含 `dirty`，基于 `markSaved` 保存点）。baseline 中只有 `record` 切片纳入撤销；`metadata`、`viewer`、`layout` 不纳入。

**类型扩充**：插件用 `declare module '@kabel/core'`（或 `'@kabel/editor'`）扩充 `KabelState` / `KabelEvents`。`history` 字段直接写在 `store.ts` 的 `KabelState` 中（包内相对路径的模块扩充在 tsup 打包 d.ts 时不可靠）。

**渲染层（`packages/ui`）**：`Workbench` 渲染工具栏 / 左中右三个 `Region` / 状态栏，内容全部来自扩展点 `ExtensionPoints.toolbar | statusbar | panels`。
- 视图类型 `View<P>` = Preact 函数组件 或 `DomView`（`mount(el, props) → { update, unmount }`）；Vue 通过 `vueView()`（继承宿主 appContext）或 `<KabelPanel>`（Teleport 到 DomView 提供的容器）接入。因此面板在切换标签、折叠、最大化时必须**保持挂载只隐藏**，否则 Teleport/DomView 内容会丢失。
- `useSelector` 精确订阅；表单字段各自订阅 `s.record.values[key]`。
- 布局状态在 `layout` 切片（`layout-plugin.ts`），持久化键 `kabel:<instanceId>:kabel:layout:state.v1`，读取经 `sanitize`。断点按**容器宽度**计算并回写到 `layout.breakpoint`（不持久化）：`md` 下右栏变为浮层（`overlay`），命令据此决定“收起”还是“关浮层”，区域收起状态统一用 `isRegionCollapsed()` 判断。
- 快捷键是 document 级监听，但只在事件目标位于工作台内、或焦点在 body 且最近一次交互在工作台内时处理（WebKit 点击按钮不获焦点）。

**元数据编辑器**：`normalizeSchema` / `normalizeRecord` 负责多种输入格式归一化；字段类型是扩展点 `FieldTypes`（字段视图必须把 `id` 放到可聚焦元素上，`focusField` 依赖 `fieldDomId(kernel.id, key)`）。错误只对 touched 字段展示，执行过整体校验（`validatedAt`）后展示全部。

**影像查看**：`resolveImage` 将 URL / 纯 base64 / Blob / 二进制 / 对象归一化为 `ImageItem`（状态中只存字符串）；为 Blob 创建的 object URL 由插件跟踪并在替换/卸载时释放，并发 `setImages` 用 generation 计数取最后一次。

## 约定

- 样式：纯 CSS，全部限定在 `.kb-root` 下、类名 `kb-` 前缀，颜色尺寸用 `tokens.css` 中的 `--kb-*` 变量。各包 CSS 源在 `src/style.css`（ui 为 `src/styles/*.css`），构建时由 `scripts/build-css.mjs` 拼接；`@kabel/editor` 的 style.css 汇总所有包，`@kabel/vue` 复制它。新增 CSS 文件需同步更新对应 package.json 的 build 脚本。
- 图标：iconfont Symbol 格式，内置集合在 `packages/ui/src/icons/sprite.ts`（24×24 线性 path），贡献项用名称引用。
- 视觉风格：企业/政务档案风格，克制、密度适中；不要加大标题、副标题、灰色描述/提示文本。
- JSX：`jsxImportSource: preact`，属性用 `class`。
- 插件单测用 `@kabel/core/testing` 的 `setupPlugins()`（内存存储）；需要 DOM 时用 `render(<Workbench kernel={kernel} />, el)` + `preact/test-utils` 的 `act`。
- `examples/plugins` 是独立 workspace 包（`@kabel-examples/plugins`，直接导出 .ts 源码），演示第三方插件分发形态，其测试被根 vitest 包含。
