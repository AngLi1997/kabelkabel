# 架构设计

## 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 宿主适配层   @kabel/vue      <KabelEditor> / KabelPanel / vueView │
├──────────────────────────────────────────────────────────────┤
│ 主包         @kabel/editor   createArchiveEditor + baseline 预设   │
├──────────────────────────────────────────────────────────────┤
│ 工作台插件   plugin-workspace（业务插件的底座）                     │
├──────────────────────────────────────────────────────────────┤
│ 渲染层       @kabel/ui       Workbench 外壳 · 布局/设置/主题插件 · 组件 │
├──────────────────────────────────────────────────────────────┤
│ 微内核       @kabel/core     Bus · Store · History · Commands ·    │
│                              Services · Extensions · Plugins       │
└──────────────────────────────────────────────────────────────┘
```

依赖只能自上而下。`@kabel/core` 不依赖 DOM 渲染库，可在 Node 中单测；插件之间不直接 import 实现，只通过**服务令牌**、**扩展点**和**命令 id** 协作（业务插件只依赖工作台：声明 `dependencies: ['kabel:workspace']`，通过它的服务与扩展点协作）。

## baseline 与插件分类

| 类别 | 插件 | 说明 |
| --- | --- | --- |
| 内置（`builtin`） | `kabel:layout`、`kabel:history`、`kabel:mode`、`kabel:save`、`kabel:feedback`、`kabel:keymap`、`kabel:contextmenu`、`kabel:palette`、`kabel:workspace`、`kabel:settings`、`kabel:theme` | 工作台骨架与公共能力：不可停用，不在 设置 › 插件管理 中显示 |
| 宿主 / 功能插件 | 如文书著录、图片标记等业务功能 | 不属于底座；通过 `plugins` 或 `editor.use()` 注册，可在运行期启停 |

底座（baseline）= 上述内置插件，不含任何业务功能。底座提供的公共能力：

| 能力 | 提供者 | 契约 |
| --- | --- | --- |
| 工作台（文档模型、渲染器、影像舞台） | `kabel:workspace` | `state.documents` / `state.stage`、`WORKSPACE_SERVICE`、`document:change`、扩展点 `WorkspaceExtensions.renderers / overlays / tools` |
| 保存契约 | `kabel:save`（core） | `kabel.save` + 可否决的 `save` 事件 + `saved` / `save:error` + dirty + 离开确认 |
| 只读模式 | `kabel:mode`（core） | `state.mode.readonly`，命令 `mutates: true` 自动禁用 |
| 消息与对话框 | `kabel:feedback`（ui） | `NOTIFY_SERVICE`：`notify` / `confirm` |
| 命令面板 | `kabel:palette`（ui） | `Mod+Shift+P`，列出所有可执行且未 `hidden` 的命令 |
| 快捷键改绑 | `kabel:keymap`（ui） | `state.keymap.overrides`（持久化）、设置 › 快捷键、冲突检测 |
| 右键菜单 | `kabel:contextmenu`（ui） | 扩展点 `ExtensionPoints.contextMenu` + `data-kb-context` |
| 视图错误隔离 | ui `ViewHost` | 面板 / 视图渲染出错只影响自身，派发 `error` 事件，可重试 |

底座只定义契约，不含业务实现；业务插件通过这些契约协作（例如著录插件监听 `save`，标注插件贡献 `image` 之上的覆盖层与右键菜单）。

插件管理按依赖关系以树形列表显示；停用被依赖的插件时依赖方一并停用（`kernel.plugins.disable`），启用插件时其已停用的依赖一并启用（`kernel.plugins.enable`），停用保留插件定义以便恢复。

## 微内核（`Kernel`）

| 成员 | 职责 |
| --- | --- |
| `bus: EventBus` | 同步 `emit` / 可否决的 `emitAsync`；处理器异常转发到 `error` 事件，不会中断其他处理器 |
| `store: Store` | 单一状态树，由各插件注册的切片（slice）组成；只能通过 `dispatch(action)` 修改 |
| `history: History` | 快照式撤销/重做，仅记录 `history: true` 的切片 |
| `commands` | 命令注册表：`id`、`run`、`enabled`、`checked`、`keybinding`；同 id 后注册覆盖、释放后恢复 |
| `services` | 服务令牌 → 实现；插件之间共享能力（如 `WORKSPACE_SERVICE`） |
| `extensions` | 扩展点 → 贡献项列表；工具栏、状态栏、面板、设置页都是扩展点 |
| `plugins` | 插件生命周期：依赖拓扑排序、同步/异步 setup、按依赖逆序卸载；可恢复的停用 / 启用 |
| `storage` | 带命名空间的持久化存储（默认 localStorage，可替换） |

## 插件模型

```ts
definePlugin({
  name: 'scope:name',
  title: '显示名称',                                   // 插件管理中显示
  dependencies: ['kabel:workspace'],
  setup(ctx) {
    ctx.registerSlice(slice);                          // 状态
    ctx.registerCommand({ id, run, keybinding });      // 行为
    ctx.contribute(ExtensionPoints.toolbar, item);     // 界面贡献
    ctx.provide(TOKEN, service);                       // 对外能力
    ctx.on('document:change', handler);                // 事件
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
- `meta.history = { label, coalesce }`：`label` 用于操作记录展示；相同 `coalesce` 键在合并窗口内合并（连续输入只产生一条记录）。
- `meta.history = false`：不入栈（如载入档案）。
- `history.transaction(label, fn)`：多次 dispatch 合并为一条。
- `history.markSaved()` 记录保存点，`state.history.dirty` 即“是否有未保存修改”。
- 历史状态本身也存放在 store（`state.history`），UI 用同样方式订阅。

底座自身的切片（`documents`、`stage`、`mode`、`save`、`keymap`、`layout`、`settings`、`theme` 等）都不纳入历史；需要撤销的业务状态由功能插件用 `history: true` 的切片声明。

## 渲染层

`@kabel/ui` 用 Preact 渲染工作台。插件贡献的**视图**是渲染层无关的：

```ts
type View<P> = ((props: P) => unknown)   // Preact 函数组件
             | { mount(el, props) { return { update?(props), unmount() } } }  // DomView：任意技术栈
```

Vue 组件通过 `vueView(Component)` 转为 DomView；`<KabelPanel>` 则直接把插槽内容 Teleport 进面板容器。面板在标签切换、区域折叠、最大化时**保持挂载**（仅隐藏），因此 DomView 与 Teleport 内容的状态不会丢失。

性能：`useSelector` 精确订阅，只在所选状态变化时重渲染。

## 布局

工作台由五部分组成：**顶部工具栏**、**中间左侧扩展面板**、**中间内容**、**中间右侧扩展面板**、**底部状态栏**。

```
┌────────────────────────── 工具栏（扩展点 toolbar）──────────────────────────┐
├──────────────┬┬───────────────────────────────────┬┬──────────────┤
│ 左侧扩展面板  ││ 内容                                ││ 右侧扩展面板  │
│ 默认：文件目录 ││ 默认：当前文件的影像                   ││ 默认：无      │
├──────────────┴┴───────────────────────────────────┴┴──────────────┤
└────────────────────────── 状态栏（扩展点 statusbar）─────────────────────────┘
```

| 区域 | 内容来源 | 说明 |
| --- | --- | --- |
| 左 | `panels`（`region: 'left'`） | 通用扩展区域，不预设用途。默认由工作台贡献“文件目录”：列出当前工具打开的文件，按目录分组，点击切换内容 |
| 中 | `panels`（`region: 'main'`） | 内容区域，默认显示影像（竖排工具条 + 撑满高度的影像舞台）；多个面板以标签页组织 |
| 右 | `panels`（`region: 'right'`） | 通用扩展区域，不预设用途。没有面板时整个区域与工具栏开关都不出现 |

`layoutPlugin` 管理 `layout` 切片：左右宽度、折叠、最大化、标签激活项、堆叠面板高度权重/折叠、窄屏区域。面板定位统一使用命令 `layout.showPanel(panelId)`（显示所在区域并激活标签）。

| 断点（容器宽度） | 行为 |
| --- | --- |
| `lg` ≥ 1100 | 三栏；工具栏图标 + 文字 |
| `md` 720–1100 | 右栏（若有面板）收为侧边条，展开时为浮层（点击外部关闭），不改写持久化的折叠状态；仅主按钮显示文字 |
| `sm` < 720 | 单栏 + 区域切换条；工具栏仅图标 |

断点按**容器**宽度计算（ResizeObserver），嵌入宿主任意位置表现一致。布局状态以 `kabel:<instanceId>:kabel:layout:state.v1` 持久化，读取时经 `sanitize` 校验，非法值回退默认。

## 工作台：业务插件的底座

`plugin-workspace`（`kabel:workspace`）回答四个问题，业务插件只需依赖它：

| 问题 | 提供 |
| --- | --- |
| 打开了哪些文件、正在看哪一个？ | 文档模型 `state.documents = { items, index, loading }`、`WORKSPACE_SERVICE`、事件 `document:change`；左侧文件目录（按 `group` 分组） |
| 内容怎么展示？ | 中间内容面板按当前文件的 `kind` 在扩展点 `WorkspaceExtensions.renderers` 中选渲染器；内置 `workspace.image`，PDF、OFD 等新类型贡献新的渲染器即可 |
| 在内容上叠加什么？ | 影像舞台 `state.stage`（缩放 / 旋转 / 平移）与坐标换算；扩展点 `WorkspaceExtensions.overlays`（覆盖层）与 `tools`（侧边工具条） |
| 文件从哪来？ | 图片来源解析（URL、base64、Blob、二进制、对象、异步加载器）与 object URL 管理，宿主通过 `setImages` / `setDocuments` 传入 |

业务插件（著录、标注、OCR…）依赖方向是 `业务插件 → workspace → ui → core`，业务插件之间不互相 import。左侧目录、内容面板、影像渲染器都是普通贡献项，同 id 贡献即可整体替换，因此界面也可以由自定义插件定义，无需改动 ui 或 workspace 源码。

## 保存与只读

保存流程由底座统一：`kabel.save` → `emitAsync('save')`（处理器可返回 Promise，reject 即失败）→ `history.markSaved()` → `saved`。状态栏显示“保存中 / 未保存 / 保存失败”，有未保存修改时离开页面弹出浏览器确认（可用 `save: { confirmLeave: false }` 关闭）。只读模式是一个全局状态，声明了 `mutates: true` 的命令（保存、撤销、重做及业务插件自己的修改命令）在只读时由命令注册表统一禁用，面板自行读取 `isReadonly(state)` 决定字段是否可编辑。

## 命令面板、快捷键与右键菜单

命令面板（`Mod+Shift+P`）列出所有可执行且带标题、未标记 `hidden` 的命令。快捷键生效顺序：用户改绑（`state.keymap.overrides`，空数组表示已清除）优先于命令声明的默认值；设置 › 快捷键 录入新键位时会检测冲突，可选择覆盖。右键菜单由 `data-kb-context` 属性标识区域，菜单项来自扩展点 `contextMenu`，`when` 可按状态隐藏。

## 影像舞台与覆盖层

工作台开放两个舞台扩展点：`WorkspaceExtensions.overlays`（铺满舞台的覆盖层，提供图片像素坐标与舞台坐标的换算 `toScreen` / `toImage`，已考虑缩放、旋转、平移）与 `WorkspaceExtensions.tools`（侧边工具条按钮）。覆盖层默认不拦截指针事件，未处理的事件冒泡到舞台用于平移。业务插件（如标注）只需基于这两个扩展点实现，不必修改工作台内部。

## 设置与主题

`settingsPlugin` 在工具栏右侧提供设置入口，弹窗分类页来自扩展点 `ExtensionPoints.settings`：插件管理（设置插件内置）、主题（主题插件贡献）。`themePlugin` 把 `state.theme` 转为根节点的 `data-scheme`、`data-density` 与 `--kb-accent` 等变量并持久化。

## 与宿主的通信

```
宿主 ──► editor.setImages / setDocuments / save / setReadonly / notify / confirm / execute(cmd) / emit(evt) / use(plugin)
宿主 ◄── on('save' | 'saved' | 'save:error' | 'mode:change' | 'document:change' | 'error' | 插件自定义事件 …)
```

可否决的流程用 `emitAsync` 派发：处理器可返回 Promise，发起方等待其完成；抛出异常视为失败。

## 快捷键作用域

文档级监听，但只在以下情况下处理：事件目标位于工作台内；或焦点在 `body` 且最近一次指针/焦点交互发生在工作台内。宿主页面其他位置的按键不会被拦截。无修饰键的快捷键在输入框内不触发。命令面板等浮层内的按键由浮层自身处理（`preventDefault`），不会同时触发全局快捷键。
