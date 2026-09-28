# Vue 3 集成

```bash
npm install @kabel/vue      # 依赖 vue ^3.3（peer）
```

`@kabel/vue` 再导出了 `@kabel/editor` 的全部内容，宿主只需安装这一个包。

```ts
import { KabelVue } from '@kabel/vue';   // 全局注册 KabelEditor / KabelPanel / KabelToolbarButton
import '@kabel/vue/style.css';
app.use(KabelVue);
```

也可以按需引入：`import { KabelEditor, KabelPanel } from '@kabel/vue'`。

## `<KabelEditor>`

### Props

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | `SchemaInput` | 著录项；传入即启用文书著录（右侧“著录信息”）；变化时重建表单（保留已填值） |
| `record` / `v-model:record` | `RecordInput` | 档案数据；外部替换时载入并清空撤销栈，内容相同则忽略（避免回环） |
| `images` | `ImageSourceInput[]` | 影像；变化时重新加载（图片标记随之清空）；对象可带 `group` 按目录分组 |
| `readonly` | `boolean` | 只读 |
| `plugins` | `PluginInput` | 追加插件（仅创建时读取） |
| `preset` | `PluginInput \| false` | 替换 baseline 预设 |
| `layout` | `LayoutOptions` | 区域标题、默认宽度、最小/最大宽度、默认折叠、标签/堆叠模式、是否持久化 |
| `metadata` / `viewer` / `annotation` / `inspector` | | 对应插件选项，传 `false` 关闭；如 `:metadata="{ aiFill }"`、`:annotation="{ labels }"` |
| `settings` / `theme` | | 设置入口 / 主题插件选项，传 `false` 关闭 |
| `instance-id` | `string` | 持久化命名空间，同页多个实例需区分 |
| `storage` | `StorageAdapter \| 'local' \| 'session' \| 'memory' \| false` | 持久化存储 |
| `icons` | `IconConfig` | 图标配置，见 [theming](theming.md) |
| `height` | `string \| number` | 容器高度，默认 `100%` |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `@save` | `SavePayload` | **可返回 Promise**，编辑器等待其完成；reject 即保存失败 |
| `@saved` | `SavePayload` | 保存成功 |
| `@save-error` | `unknown` | 保存失败 |
| `@update:record` / `@change` | `ArchiveRecord` | 著录值变化（含撤销/重做） |
| `@validate` | `ValidationResult` | 执行校验 |
| `@dirty-change` | `boolean` | 未保存状态变化 |
| `@ready` | `ArchiveEditor` | 插件全部就绪 |
| `@error` | `{ error, source }` | 插件或命令异常 |

### 实例方法

```ts
const editor = ref<InstanceType<typeof KabelEditor>>();
editor.value.save();              // Promise<SaveResult>
editor.value.validate();
editor.value.undo(); editor.value.redo();
editor.value.getRecord(); editor.value.setRecord(r);
editor.value.getAnnotations(); editor.value.setAnnotations(doc);   // 图片标记
editor.value.execute('layout.maximize', 'left');
await editor.value.use(() => import('./my-plugin'));
editor.value.unuse('acme:x');
editor.value.getEditor();         // 完整 ArchiveEditor API
```

## `<KabelPanel>`

在模板中声明一个面板，插槽内容通过 `Teleport` 渲染到工作台区域中，**完整保留宿主上下文**（响应式、provide/inject、全局组件、Pinia、Router）。

```vue
<KabelPanel id="host.records" region="left" title="件目录" :order="20">
  <RecordList :records="list" @open="open" />
</KabelPanel>
```

属性：`id`、`title`、`region`（默认 `right`）、`icon`、`order`、`weight`、`actions`。面板在标签切换或区域折叠时保持挂载。

## `<KabelToolbarButton>`

```vue
<KabelToolbarButton id="host.submit" icon="submit" label="提交审核" :order="60" @click="submit" />
<KabelToolbarButton id="host.sep" separator :order="59" />
<KabelToolbarButton id="host.save" label="保存" command="kabel.save" />   <!-- 绑定已有命令，禁用态随命令 -->
```

## 组合式 API

在 `<KabelEditor>` 的后代组件（包括 `KabelPanel` 插槽内容）中：

```ts
import { useKabel, useKabelState } from '@kabel/vue';

const editor = useKabel();                                    // ShallowRef<ArchiveEditor | null>
const dirty = useKabelState((s) => s.history.dirty, false);   // 响应式订阅状态
const page = useKabelState((s) => s.viewer.index + 1, 0);
```

## 用 Vue 编写插件视图

```ts
import { vueView } from '@kabel/vue';
ctx.contribute(ExtensionPoints.panels, { id: 'x', region: 'right', title: '关联文件', view: vueView(RelatedFiles) });
ctx.contribute(FieldTypes, { id: 'org-tree', view: vueView(OrgTreeSelect) });
```

## 常见问题

- **高度为 0**：`<KabelEditor>` 默认 `height: 100%`，父容器需有确定高度。
- **同页多个实例**：为每个实例设置不同 `instance-id`，否则布局持久化互相覆盖。
- **切换档案**：直接替换 `record`（新对象）即可；编辑器会载入并清空撤销栈。如需拦截未保存修改，监听 `@dirty-change`。
- **按档案保存图片标记**：保存时取 `getAnnotations()`；切换档案时替换 `images` 后 `await nextTick()` 再 `setAnnotations(doc)`（影像加载中提交的标记会在就绪后载入），见 `examples/vue-app/src/App.vue`。
- **宿主 UI 库样式**：Kabel 样式只作用于 `.kb-root` 内部；宿主组件放进 `KabelPanel` 后仍使用宿主自身样式。
