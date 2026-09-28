# 架构设计

## 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 宿主适配层   @kabel/vue      <KabelEditor> / KabelPanel / vueView │
├──────────────────────────────────────────────────────────────┤
│ 主包         @kabel/editor   createArchiveEditor + baseline 预设   │
├──────────────────────────────────────────────────────────────┤
│ 功能插件     plugin-metadata · plugin-viewer · plugin-inspector    │
├──────────────────────────────────────────────────────────────┤
│ 渲染层       @kabel/ui       Workbench 外壳 · layoutPlugin · 组件  │
├──────────────────────────────────────────────────────────────┤
│ 微内核       @kabel/core     Bus · Store · History · Commands ·    │
│                              Services · Extensions · Plugins       │
└──────────────────────────────────────────────────────────────┘
```

依赖只能自上而下。`@kabel/core` 不依赖 DOM 渲染库，可在 Node 中单测；插件之间不直接 import 实现，只通过**服务令牌**和**扩展点**协作。

## 微内核（`Kernel`）

| 成员 | 职责 |
| --- | --- |
| `bus: EventBus` | 同步 `emit` / 可否决的 `emitAsync`；处理器异常转发到 `error` 事件，不会中断其他处理器 |
| `store: Store` | 单一状态树，由各插件注册的切片（slice）组成；只能通过 `dispatch(action)` 修改 |
| `history: History` | 快照式撤销/重做，仅记录 `history: true` 的切片 |
| `commands` | 命令注册表：`id`、`run`、`enabled`、`checked`、`keybinding`；同 id 后注册覆盖、释放后恢复 |
| `services` | 服务令牌 → 实现；插件之间共享能力（如 `METADATA_SERVICE`、`VIEWER_SERVICE`） |
| `extensions` | 扩展点 → 贡献项列表；工具栏、状态栏、面板、字段类型都是扩展点 |
| `plugins` | 插件生命周期：依赖拓扑排序、同步/异步 setup、按依赖逆序卸载 |
| `storage` | 带命名空间的持久化存储（默认 localStorage，可替换） |

## 插件模型

```ts
definePlugin({
  name: 'scope:name',
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

baseline 中，`record` 切片（著录值）纳入历史；`metadata`（校验、分组折叠）、`layout`、`viewer` 不纳入。

## 渲染层

`@kabel/ui` 用 Preact 渲染工作台。插件贡献的**视图**是渲染层无关的：

```ts
type View<P> = ((props: P) => unknown)   // Preact 函数组件
             | { mount(el, props) { return { update?(props), unmount() } } }  // DomView：任意技术栈
```

Vue 组件通过 `vueView(Component)` 转为 DomView；`<KabelPanel>` 则直接把插槽内容 Teleport 进面板容器。面板在标签切换、区域折叠、最大化时**保持挂载**（仅隐藏），因此 DomView 与 Teleport 内容的状态不会丢失。

性能：字段组件各自 `useSelector(s => s.record.values[key])` 订阅，输入一个字段只重渲染该字段。

## 布局

`layoutPlugin` 管理 `layout` 切片：左右宽度、折叠、最大化、标签激活项、堆叠面板高度权重/折叠、窄屏区域。

| 断点（容器宽度） | 行为 |
| --- | --- |
| `lg` ≥ 1100 | 三栏；工具栏图标 + 文字 |
| `md` 720–1100 | 右栏收为侧边条，展开时为浮层（点击外部关闭），不改写持久化的折叠状态；仅主按钮显示文字 |
| `sm` < 720 | 单栏 + 区域切换条；工具栏仅图标 |

断点按**容器**宽度计算（ResizeObserver），嵌入宿主任意位置表现一致。布局状态以 `kabel:<instanceId>:kabel:layout:state.v1` 持久化，读取时经 `sanitize` 校验，非法值回退默认。

## 与宿主的通信

```
宿主 ──► editor.setRecord / setSchema / setImages / execute(cmd) / emit(evt) / use(plugin)
宿主 ◄── on('save' | 'record:change' | 'validate' | 'saved' | 'save:error' | 'viewer:change' | 'error' …)
```

`save` 事件用 `emitAsync` 派发：处理器可返回 Promise，保存命令等待其完成；抛出异常视为保存失败。

## 快捷键作用域

文档级监听，但只在以下情况下处理：事件目标位于工作台内；或焦点在 `body` 且最近一次指针/焦点交互发生在工作台内。宿主页面其他位置的按键不会被拦截。
