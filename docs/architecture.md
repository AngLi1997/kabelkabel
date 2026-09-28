# 架构设计

## 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 宿主适配层   @kabel/vue      <KabelEditor> / KabelPanel / vueView │
├──────────────────────────────────────────────────────────────┤
│ 主包         @kabel/editor   createArchiveEditor + baseline 预设   │
├──────────────────────────────────────────────────────────────┤
│ 功能插件     plugin-viewer · plugin-annotation ·                   │
│              plugin-metadata · plugin-inspector                    │
├──────────────────────────────────────────────────────────────┤
│ 渲染层       @kabel/ui       Workbench 外壳 · 布局/设置/主题插件 · 组件 │
├──────────────────────────────────────────────────────────────┤
│ 微内核       @kabel/core     Bus · Store · History · Commands ·    │
│                              Services · Extensions · Plugins       │
└──────────────────────────────────────────────────────────────┘
```

依赖只能自上而下。`@kabel/core` 不依赖 DOM 渲染库，可在 Node 中单测；插件之间不直接 import 实现，只通过**服务令牌**、**扩展点**和**命令 id** 协作（`plugin-annotation` 依赖 `plugin-viewer` 的扩展点，`plugin-inspector` 依赖 `plugin-metadata`）。

## baseline 与插件分类

| 类别 | 插件 | 说明 |
| --- | --- | --- |
| 内置（`builtin`） | `kabel:layout`、`kabel:history`、`kabel:viewer`、`kabel:settings`、`kabel:theme` | 构成工作台骨架：不可停用，不在 设置 › 插件管理 中显示 |
| 默认功能插件 | `kabel:annotation`（图片标记） | baseline 默认启用，可在插件管理中启停 |
| 可选功能插件 | `kabel:metadata`（文书著录）、`kabel:inspector`（辅助信息，依赖文书著录） | 传入 `schema` / `record` / `metadata` 时启用 |
| 宿主 / 第三方插件 | 如 `example:archive-code` | 通过 `plugins` 或 `editor.use()` 注册 |

插件管理按依赖关系以树形列表显示；停用被依赖的插件时依赖方一并停用（`kernel.plugins.disable`），启用插件时其已停用的依赖一并启用（`kernel.plugins.enable`），停用保留插件定义以便恢复。

## 微内核（`Kernel`）

| 成员 | 职责 |
| --- | --- |
| `bus: EventBus` | 同步 `emit` / 可否决的 `emitAsync`；处理器异常转发到 `error` 事件，不会中断其他处理器 |
| `store: Store` | 单一状态树，由各插件注册的切片（slice）组成；只能通过 `dispatch(action)` 修改 |
| `history: History` | 快照式撤销/重做，仅记录 `history: true` 的切片 |
| `commands` | 命令注册表：`id`、`run`、`enabled`、`checked`、`keybinding`；同 id 后注册覆盖、释放后恢复 |
| `services` | 服务令牌 → 实现；插件之间共享能力（如 `METADATA_SERVICE`、`VIEWER_SERVICE`） |
| `extensions` | 扩展点 → 贡献项列表；工具栏、状态栏、面板、字段类型都是扩展点 |
| `plugins` | 插件生命周期：依赖拓扑排序、同步/异步 setup、按依赖逆序卸载；可恢复的停用 / 启用 |
| `storage` | 带命名空间的持久化存储（默认 localStorage，可替换） |

## 插件模型

```ts
definePlugin({
  name: 'scope:name',
  title: '显示名称',                                   // 插件管理中显示
  dependencies: ['kabel:metadata'],
  setup(ctx) {
    ctx.registerSlice(slice);                          // 状态
    ctx.registerCommand({ id, run, keybinding });      // 行为
    ctx.contribute(ExtensionPoints.toolbar, item);     // 界面贡献
    ctx.provide(TOKEN, service);                       // 对外能力
    ctx.on('save', handler);                           // 事件
    return () => {/* 额外清理 */};
  },
});
```

`ctx` 上注册的一切都挂在插件自己的 `DisposableStore` 上，`kernel.unuse(name)` 时逆序释放，UI 会实时反映（按钮消失、面板卸载）。这使运行期注册/卸载成为常规操作，而不是特例。

**编译期注册**：`createArchiveEditor({ plugins })` / `createKernel({ plugins })`。全部是同步插件时，函数返回前即已完成注册，首帧渲染即完整。
**运行期注册**：`editor.use(plugin | () => import('./plugin'))`，返回 Promise。

## 状态与撤销

```
UI 事件 ──► dispatch(action) ──► 各切片 reducer（纯函数，不可变更新）
                                     │
                         新 state ◄──┘
                            │
             ┌──────────────┼───────────────────────┐
             ▼              ▼                       ▼
        History 监听     插件 watch（校验、事件）   UI 订阅（useSelector 精确重渲染）
```

- 切片通过 `createSlice({ name, initialState, reducers, history })` 声明，自动生成带命名空间的 action creator。
- `History` 监听 store：对比变更前后 `history: true` 切片的引用，有变化则入栈快照（只存引用，开销极低）。
- `meta.history = { label, coalesce }`：`label` 用于“操作记录”面板；相同 `coalesce` 键在合并窗口内合并（连续输入只产生一条记录）。
- `meta.history = false`：不入栈（如载入档案）。
- `history.transaction(label, fn)`：多次 dispatch 合并为一条。
- `history.markSaved()` 记录保存点，`state.history.dirty` 即“是否有未保存修改”。
- 历史状态本身也存放在 store（`state.history`），UI 用同样方式订阅。

baseline 中，`record`（著录值）与 `annotations`（图片标记）切片纳入历史；`metadata`（校验、分组折叠）、`annotator`（标记类型、选中、工具）、`viewer`、`layout`、`settings`、`theme` 不纳入。

## 渲染层

`@kabel/ui` 用 Preact 渲染工作台。插件贡献的**视图**是渲染层无关的：

```ts
type View<P> = ((props: P) => unknown)   // Preact 函数组件
             | { mount(el, props) { return { update?(props), unmount() } } }  // DomView：任意技术栈
```

Vue 组件通过 `vueView(Component)` 转为 DomView；`<KabelPanel>` 则直接把插槽内容 Teleport 进面板容器。面板在标签切换、区域折叠、最大化时**保持挂载**（仅隐藏），因此 DomView 与 Teleport 内容的状态不会丢失。

性能：字段组件各自 `useSelector(s => s.record.values[key])` 订阅，输入一个字段只重渲染该字段。

## 布局

区域分工：

| 区域 | 默认模式 | 内容 |
| --- | --- | --- |
| 左 | 标签页 | 留给宿主面板（如件目录） |
| 中 | 标签页 | 影像查看：竖排工具条 + 缩略图列 + 撑满高度的影像舞台，图片标记覆盖在影像上 |
| 右 | 标签页 | 标记 / 著录信息 / 校验结果 / 操作记录 |

`layoutPlugin` 管理 `layout` 切片：左右宽度、折叠、最大化、标签激活项、堆叠面板高度权重/折叠、窄屏区域。面板定位统一使用命令 `layout.showPanel(panelId)`（显示所在区域并激活标签）。

| 断点（容器宽度） | 行为 |
| --- | --- |
| `lg` ≥ 1100 | 三栏；工具栏图标 + 文字 |
| `md` 720–1100 | 右栏收为侧边条，展开时为浮层（点击外部关闭），不改写持久化的折叠状态；仅主按钮显示文字 |
| `sm` < 720 | 单栏 + 区域切换条；工具栏仅图标 |

断点按**容器**宽度计算（ResizeObserver），嵌入宿主任意位置表现一致。布局状态以 `kabel:<instanceId>:kabel:layout:state.v1` 持久化，读取时经 `sanitize` 校验，非法值回退默认。

## 影像覆盖层

`plugin-viewer` 开放两个扩展点：`ViewerExtensions.overlays`（铺满舞台的覆盖层，提供图片像素坐标与舞台坐标的换算 `toScreen` / `toImage`，已考虑缩放、旋转、平移）与 `ViewerExtensions.tools`（侧边工具条按钮）。覆盖层默认不拦截指针事件，未处理的事件冒泡到舞台用于平移。`plugin-annotation` 完全基于这两个扩展点实现，不修改影像查看插件内部。

## 设置与主题

`settingsPlugin` 在工具栏右侧提供设置入口，弹窗分类页来自扩展点 `ExtensionPoints.settings`：著录项（文书著录贡献）、插件管理、主题（主题插件贡献）。`themePlugin` 把 `state.theme` 转为根节点的 `data-scheme`、`data-density` 与 `--kb-accent` 等变量并持久化。

## 与宿主的通信

```
宿主 ──► editor.setRecord / setSchema / setImages / setAnnotations / execute(cmd) / emit(evt) / use(plugin)
宿主 ◄── on('save' | 'record:change' | 'validate' | 'saved' | 'save:error' | 'schema:change'
           | 'viewer:change' | 'annotation:change' | 'error' …)
```

`save` 事件用 `emitAsync` 派发：处理器可返回 Promise，保存命令等待其完成；抛出异常视为保存失败。

## 快捷键作用域

文档级监听，但只在以下情况下处理：事件目标位于工作台内；或焦点在 `body` 且最近一次指针/焦点交互发生在工作台内。宿主页面其他位置的按键不会被拦截。无修饰键的快捷键（数字键切换标记类型、`Delete`、`R` / `H` 等）在输入框内不触发。
