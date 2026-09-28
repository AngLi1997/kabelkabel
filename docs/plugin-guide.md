# 插件开发指南

本指南从一个最小插件开始，逐步覆盖状态、命令、界面贡献、服务、字段类型、Vue 视图、运行期注册和单元测试。完整示例见 [`examples/plugins/`](../examples/plugins/README.md)，内置插件的用法见 `packages/plugin-*/README.md`。

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
definePlugin({ name: 'acme:x', dependencies: ['kabel:metadata', 'kabel:viewer'], setup(ctx) { ... } });
```

- 同批注册时按依赖拓扑排序，与书写顺序无关；缺失或循环依赖会报错。
- 卸载被依赖的插件时，依赖方会先被卸载。
- 内置插件名：`kabel:layout`、`kabel:history`、`kabel:metadata`、`kabel:viewer`、`kabel:inspector`、`kabel:annotation`、`kabel:settings`、`kabel:theme`（亦可使用常量 `METADATA_PLUGIN`、`VIEWER_PLUGIN`、`ANNOTATION_PLUGIN`）。
- `title` 为设置 › 插件管理中的显示名称；`builtin: true` 表示 baseline 内置插件：不可在运行期停用，也不在插件管理中显示（布局、撤销与重做、影像查看、设置、主题）。插件管理以树形列表显示：依赖其他插件的插件缩进列在被依赖者之下。

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
- 同 id 重复注册：后者生效，释放后恢复前者——宿主可借此**覆盖内置命令**（例如自定义 `kabel.save`）。
- 执行前后派发 `command:before` / `command:after` 事件，可用于审计。

## 6. 界面贡献（扩展点）

### 工具栏 `ExtensionPoints.toolbar`

```ts
{ id, order?, group?: 'start' | 'end', type?: 'button' | 'separator' | 'view',
  icon?, label?, showLabel?, primary?, tooltip?, command?, args?, onClick?, when?, view? }
```

内置排序参考：保存 10，撤销/重做 20–21，校验 30，（示例）生成档号 31，标记类型 59–60（分隔符 + 标记类型条），布局按钮 900+，设置 1000（`group: 'end'`）。

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
- 右侧区域的内置排序：标记 10、著录信息 20、校验结果 30、操作记录 40。
- `actions` 显示在区域标题栏（标签页模式下显示当前标签的操作）：`{ id, icon, tooltip, command? | onClick?, active? }`。右侧标签较多时标题栏空间有限，可像文书著录那样在面板内放一条工具条，用 `@kabel/ui` 的 `<PanelActions actions={...} />` 渲染。
- `view` 收到 `{ kernel, panelId, region }`。定位到面板：`kernel.execute('layout.showPanel', panelId)`。

### 影像覆盖层与工具条 `ViewerExtensions.overlays / tools`

由 `@kabel/plugin-viewer` 提供（依赖 `kabel:viewer`）：

```ts
ctx.contribute(ViewerExtensions.overlays, { id, order?, view });   // view 收到 { kernel, image, width, height, scale, rotation, toScreen, toImage }
ctx.contribute(ViewerExtensions.tools, { id, icon, tooltip, command, order? });   // 侧边工具条按钮，选中态取命令 checked
```

覆盖层铺满舞台、默认不拦截指针事件；未处理（未 `stopPropagation`）的指针事件冒泡到舞台用于平移。`toScreen` / `toImage` 在图片像素坐标与舞台坐标间换算（已考虑缩放、旋转、平移）。`@kabel/plugin-annotation` 即基于这两个扩展点实现。

### 设置页 `ExtensionPoints.settings`

```ts
{ id, title, icon?, order?, view, when? }
```

- 工具栏右侧设置按钮打开设置弹窗，左侧为分类导航，右侧渲染当前分类的 `view`（收到 `{ kernel }`）。已有分类：`metadata`（著录项，文书著录贡献，order 5）、`plugins`（插件管理，order 10）、`theme`（主题，order 20）。
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
| `METADATA_SERVICE` | `getSchema/setSchema/getRecord/setRecord/getValue/setValue/setValues/setReadonly/validate/focusField` |
| `VIEWER_SERVICE` | `setImages/getImages/current/goto` |
| `ANNOTATION_SERVICE` | `getLabels/getAnnotations/setAnnotations/exportJson/exportYolo` |
| `LAYOUT_CONFIG` | 解析后的布局配置（只读） |
| `THEME_ACCENTS` | 可选主题色列表 |

## 9. 自定义字段类型

```tsx
import { FieldTypes, Select, type FieldViewProps } from '@kabel/editor';

function FondsField({ id, field, value, onChange, onBlur, disabled, invalid }: FieldViewProps) {
  const options = useFondsOptions();            // 例如从接口加载
  return <Select id={id} value={value as string} options={options} onChange={onChange} onBlur={onBlur} disabled={disabled} invalid={invalid} />;
}

ctx.contribute(FieldTypes, {
  id: 'fonds',                                   // Schema 中 type: 'fonds'
  view: FondsField,                              // 也可用 vueView(FondsSelect)
  validate: (value, field) => (/^[A-Z]\d{3}$/.test(String(value)) ? null : `${field.label}格式不正确`),
});
```

- `id` 必须传给可聚焦元素，`focusField`（校验定位）依赖它。
- 调用 `onChange(value)` 写入值（自动进入撤销栈并合并连续输入），失焦时调用 `onBlur()` 以开始展示该字段的校验错误。
- 注册同名 `id`（如 `text`）可覆盖内置字段类型。

## 10. 事件

```ts
declare module '@kabel/editor' {
  interface KabelEvents { 'tags:changed': { tags: string[] } }
}
ctx.bus.emit('tags:changed', { tags });
ctx.on('record:change', ({ record }) => ...);
```

内置事件：`ready`、`error`、`plugin:registered`、`plugin:unregistered`、`command:before`、`command:after`、`record:change`、`save`（可异步否决）、`saved`、`save:error`、`validate`、`field:focus`、`schema:change`、`viewer:change`、`annotation:change`。

## 11. 单元测试

每个插件都可以脱离界面独立测试：

```ts
import { historyPlugin, metadataPlugin } from '@kabel/editor';
import { setupPlugins } from '@kabel/core/testing';

it('生成档号', async () => {
  const { kernel, toolbar, statusbar, panels } = await setupPlugins([
    historyPlugin(),
    metadataPlugin({ schema, record: { fonds: 'J012', year: 2024, retention: '永久', itemNo: 3 } }),
    archiveCodePlugin(),
  ]);
  await kernel.execute('archiveCode.generate');
  expect(kernel.getState().record.values.archiveCode).toBe('J012-WS·2024-Y-0003');
  await kernel.execute('kabel.undo');
  expect(kernel.getState().record.values.archiveCode).toBeUndefined();
});
```

`setupPlugins` 使用内存存储，互不干扰。需要验证渲染时，可用 `render(<Workbench kernel={kernel} />, el)`（见 `packages/plugin-inspector/test`）。

## 12. 示例插件

| 示例 | 演示点 |
| --- | --- |
| [`examples/plugins/archive-code`](../examples/plugins/archive-code/README.md) | 编译期注册、配置项、依赖、命令 + 快捷键、工具栏 + 状态栏、服务调用、事件扩充、单测 |
| [`packages/plugin-annotation`](../packages/plugin-annotation/README.md) | 基于影像覆盖层扩展点的交互插件：拖拽绘制、坐标换算、数字快捷键、导出 |
| `examples/vue-app` 中的 `<KabelPanel>` | 用 Vue 模板声明面板（件目录） |

## 13. 目录与分发

独立分发的插件建议与 `packages/plugin-*` 保持一致的结构：

```
my-plugin/
├── package.json      peerDependencies: @kabel/editor（或 @kabel/core + 所依赖的插件包）
├── README.md         功能、集成方式、配置、命令、服务、事件、样式
├── src/
│   ├── index.ts      唯一对外入口
│   ├── plugin.ts     definePlugin 工厂函数
│   └── style.css     可选，类名自有前缀，使用 --kb-* 令牌
└── test/
```

Kabel 相关依赖声明为 **peerDependencies**，由宿主提供，避免重复安装内核与渲染层。

## 14. 检查清单

- [ ] `name` 唯一，设置了 `title`，声明了 `dependencies`
- [ ] 插件目录下有 README.md（功能与集成方式）
- [ ] 所有注册都通过 `ctx`，卸载后无残留（可写一个 `kernel.unuse` 的测试）
- [ ] reducer 纯函数、不可变更新；需要撤销的切片设置 `history: true`，并为 action 提供 `label`
- [ ] 命令提供 `enabled`，按钮禁用态才能正确反映
- [ ] 样式类名加自有前缀，颜色使用 `var(--kb-*)` 令牌
- [ ] 为新增的状态 / 事件写 `declare module` 类型扩充
