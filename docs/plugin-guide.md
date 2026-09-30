# 插件开发指南

本指南从一个最小插件开始，逐步覆盖状态、命令、界面贡献、服务、Vue 视图、运行期注册和单元测试。工作台（所有业务插件的底座）的用法见 `packages/plugins/workspace/README.md`，宿主侧的面板示例见 `examples/vue-app`。

## 1. 最小插件

```ts
import { definePlugin, ExtensionPoints } from '@kabel/editor';

export const helloPlugin = () =>
  definePlugin({
    name: 'acme:hello',
    setup(ctx) {
      ctx.registerCommand({ id: 'hello.say', title: '问候', run: () => alert('你好') });
      ctx.contribute(ExtensionPoints.toolbar, { id: 'hello.say', icon: 'info', label: '问候', command: 'hello.say', order: 60 });
    },
  });
```

注册：

```ts
createArchiveEditor(el, { plugins: [helloPlugin()] });      // 编译期
await editor.use(helloPlugin());                             // 运行期
await editor.use(() => import('./hello'));                   // 运行期懒加载（default 导出）
editor.unuse('acme:hello');                                  // 卸载，按钮随之消失
```

约定：

- `name` 全局唯一，建议 `scope:name`；命令 id 建议 `模块.动作`。
- 需要配置的插件写成工厂函数 `(options) => definePlugin(...)`；设置 `title` 作为 设置 › 插件管理 中的显示名称。
- 通过 `ctx` 注册的一切在卸载时自动释放，**不要**直接调用 `kernel.commands.register` 等底层 API（除非你自己管理释放）。

## 2. 插件上下文 `ctx`

| API | 说明 |
| --- | --- |
| `ctx.registerSlice(slice, preloaded?)` | 注册状态切片 |
| `ctx.registerCommand(def)` | 注册命令 |
| `ctx.contribute(point, ...items)` | 向扩展点贡献项 |
| `ctx.provide(token, value)` | 提供服务 |
| `ctx.on(event, handler)` | 订阅事件 |
| `ctx.watch(selector, cb, opts?)` | 监听状态选择结果变化 |
| `ctx.onDispose(fn)` | 额外清理逻辑（也可由 `setup` 返回清理函数） |
| `ctx.getState()` / `ctx.dispatch(action)` | 读取 / 修改状态 |
| `ctx.storage` | 以插件名为命名空间的持久化存储（`get(key, fallback)` / `set` / `remove`） |
| `ctx.kernel` / `bus` / `store` / `history` / `services` / `extensions` | 底层对象 |

## 3. 依赖

```ts
definePlugin({ name: 'acme:x', dependencies: ['kabel:workspace'], setup(ctx) { ... } });
```

- 同批注册时按依赖拓扑排序，与书写顺序无关；缺失或循环依赖会报错。
- 卸载被依赖的插件时，依赖方会先被卸载。
- 内置插件名：`kabel:layout`、`kabel:history`、`kabel:mode`、`kabel:save`、`kabel:feedback`、`kabel:keymap`、`kabel:contextmenu`、`kabel:palette`、`kabel:workspace`、`kabel:settings`、`kabel:theme`（常量 `WORKSPACE_PLUGIN`、`WORKSPACE_PLUGIN`）。业务插件统一声明 `dependencies: ['kabel:workspace']`（常量 `WORKSPACE_PLUGIN`），只通过工作台的服务与扩展点协作。
- `title` 为设置 › 插件管理中的显示名称；`builtin: true` 表示 baseline 内置插件：不可在运行期停用，也不在插件管理中显示（布局、撤销与重做、工作台、设置、主题等）。插件管理以树形列表显示：依赖其他插件的插件缩进列在被依赖者之下。

## 4. 状态

```ts
import { createSlice } from '@kabel/editor';

interface TagState { tags: string[] }

declare module '@kabel/editor' {          // 为 state 补充类型
  interface KabelState { tags: TagState }
}

export const tagSlice = createSlice({
  name: 'tags',
  initialState: { tags: [] } as TagState,
  history: true,                          // 纳入撤销/重做
  reducers: {
    add: (s: TagState, tag: string) => ({ tags: [...s.tags, tag] }),
    clear: () => ({ tags: [] }),
  },
});

setup(ctx) {
  ctx.registerSlice(tagSlice);
  ctx.dispatch(tagSlice.actions.add('党建', { history: { label: '添加标签' } }));
  ctx.watch((s) => s.tags.tags.length, (n) => console.log('标签数', n));
}
```

规则：

- reducer 必须是纯函数、返回新对象；返回原对象表示“无变化”（不会通知订阅者、不会入栈）。
- reducer 内不能 dispatch。
- action 的 `meta.history`：`{ label, coalesce }` 或 `false`。
- 需要把多次修改作为一步撤销：`ctx.history.transaction('批量修改', () => { ... })`。

## 5. 命令与快捷键

无修饰键的快捷键（如数字、字母、`Delete`）在输入框、下拉框内不会触发，可放心使用。


```ts
ctx.registerCommand({
  id: 'tags.clear',
  title: '清空标签',
  icon: 'close',
  keybinding: 'Mod+Shift+K',          // Mod：macOS 为 ⌘，其余为 Ctrl
  enabled: (k) => k.getState().tags.tags.length > 0,   // 决定按钮禁用态与快捷键是否生效
  checked: (k) => false,              // 切换类按钮的选中态
  run: (k) => k.dispatch(tagSlice.actions.clear()),
});
```

- `kernel.execute(id, ...args)` 返回 Promise；禁用时不执行。
- 同 id 重复注册：后者生效，释放后恢复前者——宿主可借此**覆盖内置命令**（例如自定义 `workspace.next`）。
- 命令上的两个标记：`mutates: true`（会修改内容，只读模式下自动禁用）、`hidden: true`（需要参数或仅供内部调用，不出现在命令面板与快捷键设置中）。用户在 设置 › 快捷键 里改绑后，`keybinding` 只是默认值。
- 执行前后派发 `command:before` / `command:after` 事件，可用于审计。

## 6. 界面贡献（扩展点）

### 工具栏 `ExtensionPoints.toolbar`

```ts
{ id, order?, group?: 'start' | 'end', type?: 'button' | 'separator' | 'view',
  icon?, label?, showLabel?, primary?, tooltip?, command?, args?, onClick?, when?, view? }
```

内置排序参考：撤销/重做 20–21，布局按钮 900+，设置 1000（`group: 'end'`）；自定义按钮建议使用 30–800。左 / 右开关按钮仅在对应区域有面板时显示。

### 状态栏 `ExtensionPoints.statusbar`

```ts
{ id, align?: 'left' | 'right', order?, icon?, text?: (state, kernel) => string | null,
  tone?: (state) => 'default' | 'success' | 'warning' | 'danger', tooltip?, command?, view? }
```

`text` 返回空值时隐藏。

### 面板 `ExtensionPoints.panels`

```ts
{ id, region: 'left' | 'main' | 'right', title, icon?, order?, view,
  actions?: PanelAction[], weight?, when? }
```

- 区域内多个面板默认以**标签页**组织；可通过 `layout.regions.<id>.mode = 'stack'` 改为上下堆叠（可折叠、可拖拽调整高度，`weight` 为初始高度比例）。
- 左右两侧是**通用扩展区域**，没有预设用途：区域内没有面板时整个区域不渲染，贡献第一个面板后自动出现。内置面板：左侧“文件目录”（`workspace.files`，order 10）、中间“内容”（`workspace.content`，order 10）。
- `actions` 显示在区域标题栏（标签页模式下显示当前标签的操作）：`{ id, icon, tooltip, command? | onClick?, active? }`。面板较多时标题栏空间有限，可在面板内放一条工具条，用 `@kabel/ui` 的 `<PanelActions actions={...} />` 渲染。
- `view` 收到 `{ kernel, panelId, region }`。定位到面板：`kernel.execute('layout.showPanel', panelId)`。

### 影像覆盖层与工具条 `WorkspaceExtensions.overlays / tools`

由 `@kabel/plugin-workspace` 提供（依赖 `kabel:workspace`）；覆盖层和工具条作用于影像舞台，渲染器决定各类文件如何展示：

```ts
ctx.contribute(WorkspaceExtensions.overlays, { id, order?, view });   // view 收到 { kernel, image, width, height, scale, rotation, toScreen, toImage }
ctx.contribute(WorkspaceExtensions.tools, { id, icon, tooltip, command, order? });   // 侧边工具条按钮，选中态取命令 checked
```

覆盖层铺满舞台、默认不拦截指针事件。需要指针的交互（框选、绘制…）先 `ctx.onDispose(workspace.acquireTool('acme:draw'))` 租用舞台，并在覆盖层声明 `tool: 'acme:draw'`：租用期间左键 / 右键交给该覆盖层，平移改为**空格 + 左键**（或中键）；被其他工具抢占时会收到事件 `stage:tool-change`，据此退出。没有交互工具时左 / 右 / 中键拖动都是平移。规则由工作台统一执行，详见工作台 README「舞台鼠标规则」。`toScreen` / `toImage` 在图片像素坐标与舞台坐标间换算（已考虑缩放、旋转、平移）。可用它们实现标注、测量、水印等叠加在影像上的交互。

### 右键菜单 `ExtensionPoints.contextMenu`

```ts
{ id, order?, target?: string | string[], group?, label, icon?, command?, args?, onClick?(kernel, { target, data }), when?(state, kernel, ctx) }
```

给元素加 `data-kb-context="区域标识"`（可选 `data-kb-context-data`），在其上右键即显示 `target` 匹配该标识的菜单项；同一 `group` 相邻，组间有分隔线。没有匹配项时保留浏览器原生菜单，输入框内始终保留原生菜单。内置区域标识：`document`（文件目录中的文件，`data` 为下标）、`stage`（影像舞台）、`workbench`（其他区域）；`target: '*'` 表示所有区域。

### 文件渲染器 `WorkspaceExtensions.renderers`

```ts
ctx.contribute(WorkspaceExtensions.renderers, { id: 'pdf.renderer', match: (doc) => doc.kind === 'pdf', view: PdfView }); // view 收到 { kernel, document }
```

内容区域按当前文件的 `kind` 选择第一个 `match` 的渲染器（按 order 升序）；没有匹配的渲染器时提示暂不支持预览。文件由 `WORKSPACE_SERVICE.setDocuments(items)`（或宿主 `editor.setDocuments`）写入，工作台自带 `image` 类型的渲染器。

### 设置页 `ExtensionPoints.settings`

```ts
{ id, title, icon?, order?, view, when? }
```

- 工具栏右侧设置按钮打开设置弹窗，左侧为分类导航，右侧渲染当前分类的 `view`（收到 `{ kernel }`）。已有分类：`plugins`（插件管理，order 10）、`shortcuts`（快捷键，order 15）、`theme`（主题，order 20）。
- 命令：`settings.open`（可传分类 id）、`settings.close`。

### 覆盖内置贡献

相同 `id` 的贡献项后注册者生效，释放后恢复。例如隐藏内置“重置布局”按钮：

```ts
ctx.contribute(ExtensionPoints.toolbar, { id: 'layout.reset', type: 'button', when: () => false });
```

### 自定义扩展点

插件自己也可以开放扩展点，供其他插件贡献：

```ts
export const ExportFormats = defineExtensionPoint<{ id: string; label: string; run(values: object): Blob }>('acme.exportFormats');
// 读取
ctx.extensions.get(ExportFormats).getAll();
```

元数据编辑器的字段类型就是这样实现的（`FieldTypes`）。

## 7. 视图：Preact、DOM 与 Vue

**Preact 函数组件**（内置渲染层，可用 `@kabel/ui` 的 hooks 与组件）：

```tsx
import { useSelector, Button, Empty } from '@kabel/editor';

function TagPanel({ kernel }: PanelViewProps) {
  const tags = useSelector((s) => s.tags.tags);
  if (!tags.length) return <Empty text="暂无标签" />;
  return <ul>{tags.map((t) => <li>{t}</li>)}</ul>;
}
```

需要在插件包的 tsconfig 中设置 `"jsx": "react-jsx", "jsxImportSource": "preact"`。

**DomView**（任意技术栈，无需 JSX）：

```ts
const view: DomView<PanelViewProps> = {
  mount(el, props) {
    el.innerHTML = '<div class="acme-chart"></div>';
    const chart = initChart(el.firstElementChild!);
    return { update: (next) => chart.refresh(next), unmount: () => chart.destroy() };
  },
};
```

**Vue 组件**：

```ts
import { vueView } from '@kabel/vue';
import RelatedFiles from './RelatedFiles.vue';

ctx.contribute(ExtensionPoints.panels, { id: 'acme.related', region: 'right', title: '关联文件', view: vueView(RelatedFiles) });
```

组件以 props 接收视图属性（`kernel`、`panelId` …），并继承宿主应用的 `appContext`（全局组件、指令、Pinia、Router 均可用）。

## 8. 服务：插件间协作

```ts
// 提供
export const TAG_SERVICE = createServiceToken<{ add(tag: string): void }>('acme.tags');
ctx.provide(TAG_SERVICE, { add: (t) => ctx.dispatch(tagSlice.actions.add(t)) });

// 使用（记得声明 dependencies）
ctx.services.get(TAG_SERVICE).add('档案');
ctx.services.tryGet(TAG_SERVICE)?.add('档案');   // 可选依赖
```

内置服务：

| 令牌 | 能力 |
| --- | --- |
| `WORKSPACE_SERVICE` | `set/getAll/current/goto/setLoading`（文件列表与当前文件） |
| `WORKSPACE_SERVICE` | `setImages/getImages/current/goto`（图片来源解析） |
| `NOTIFY_SERVICE` | `notify/dismiss/confirm` |
| `LAYOUT_CONFIG` | 解析后的布局配置（只读） |
| `THEME_ACCENTS` | 可选主题色列表 |

## 8.5 保存、只读、消息与对话框

- **保存**：底座的 `kabel.save`（`Mod+S`）依次等待所有 `save` 事件处理器，全部成功后标记撤销栈保存点（`state.history.dirty` 归零）并派发 `saved`，任一处理器 reject 则派发 `save:error` 并提示。业务插件只需 `ctx.on('save', async () => { await api.save(...) })`；有 `save` 监听或有未保存修改时工具栏才显示“保存”按钮。
- **只读**：读取 `isReadonly(state)`（或 ui 的 `useReadonly()`）决定是否可编辑；会修改内容的命令声明 `mutates: true` 即可自动禁用。
- **消息与对话框**：`kernel.services.tryGet(NOTIFY_SERVICE)?.notify('已保存', { type: 'success' })`；`await notify.confirm({ message: '确定删除？', danger: true })` 返回 `boolean`。

## 9. 向左 / 右侧区域贡献面板

```tsx
ctx.contribute(ExtensionPoints.panels, {
  id: 'acme.info',
  region: 'right',                       // 'left' | 'right'；也可放到 'main' 与影像并列成标签页
  title: '文件信息',
  order: 20,
  view: ({ kernel }) => <InfoPanel kernel={kernel} />,
});
```

面板内通过 `WORKSPACE_SERVICE` 读取当前文件，或订阅 `document:change` 事件、`state.documents` 切片，即可随内容区域切换文件而更新。面板渲染出错时被错误边界隔离（显示“此区域加载失败”与重试，并派发 `error` 事件），不会影响其他面板。

## 10. 事件

```ts
declare module '@kabel/editor' {
  interface KabelEvents { 'tags:changed': { tags: string[] } }
}
ctx.bus.emit('tags:changed', { tags });
ctx.on('document:change', ({ document }) => ...);
```

内置事件：`ready`、`error`、`plugin:registered`、`plugin:unregistered`、`command:before`、`command:after`、`document:change`、`save`（可异步否决）、`saved`、`save:error`、`mode:change`。可否决的流程用 `bus.emitAsync`，处理器返回的 Promise 会被等待。

## 11. 单元测试

每个插件都可以脱离界面独立测试：

```ts
import { historyPlugin, workspacePlugin } from '@kabel/editor';
import { setupPlugins } from '@kabel/core/testing';

it('贡献右侧面板', async () => {
  const { kernel, panels } = await setupPlugins([historyPlugin(), workspacePlugin(), infoPlugin()]);
  expect(panels().some((p) => p.id === 'acme.info' && p.region === 'right')).toBe(true);
  kernel.unuse('acme:info');
  expect(panels().some((p) => p.id === 'acme.info')).toBe(false);
});
```

`setupPlugins` 使用内存存储，互不干扰。需要验证渲染时，可用 `render(<Workbench kernel={kernel} />, el)`（见 `packages/editor/test`）。

## 12. 示例插件

| 示例 | 演示点 |
| --- | --- |
| [`packages/plugins/workspace`](../packages/plugins/workspace/README.md) | 内置插件：切片、命令、服务、面板与状态栏贡献、扩展点开放（覆盖层 / 工具条） |
| [`packages/plugins/region-select`](../packages/plugins/region-select/README.md) | 能力插件：舞台工具租约、可扩展的形状扩展点、事件广播、可替换的服务提供者（裁剪器） |
| `examples/vue-app` 中的 `<KabelPanel>` | 用 Vue 模板声明右侧面板，读取当前文件 |

## 13. 目录与分发

**仓库内新增的扩展插件统一放在 `packages/plugins/<name>/`**，包名 `@kabel/plugin-<name>`（内置的工作台也在此目录：`packages/plugins/workspace`）。目录结构、`package.json` 模板与接入清单见 [`packages/plugins/README.md`](../packages/plugins/README.md)。结构如下：

```
packages/plugins/my-plugin/
├── package.json      dependencies: @kabel/core、@kabel/ui（workspace:*）及所依赖的插件包
├── README.md         功能、集成方式、配置、命令、服务、事件、样式
├── src/
│   ├── index.ts      唯一对外入口
│   ├── plugin.ts     definePlugin 工厂函数
│   └── style.css     可选，类名自有前缀，使用 --kb-* 令牌
└── test/
```

仓库外独立分发的插件同样沿用这个结构，但 Kabel 相关依赖声明为 **peerDependencies**（`@kabel/editor`，或 `@kabel/core` + 所依赖的插件包），由宿主提供，避免重复安装内核与渲染层。

## 14. 检查清单

- [ ] `name` 唯一，设置了 `title`，声明了 `dependencies`
- [ ] 插件目录下有 README.md（功能与集成方式）
- [ ] 所有注册都通过 `ctx`，卸载后无残留（可写一个 `kernel.unuse` 的测试）
- [ ] reducer 纯函数、不可变更新；需要撤销的切片设置 `history: true`，并为 action 提供 `label`
- [ ] 命令提供 `enabled`，按钮禁用态才能正确反映
- [ ] 样式类名加自有前缀，颜色使用 `var(--kb-*)` 令牌
- [ ] 为新增的状态 / 事件写 `declare module` 类型扩充
