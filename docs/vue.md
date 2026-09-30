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
| `readonly` | `boolean` | 只读模式（`v-model` 之外的单向同步） |
| `save` | `{ confirmLeave? } \| false` | 保存契约选项 |
| `workspace` | `{ items?, thumbnails?, directory?, content? } \| false` | 工作台选项（文件目录、内容面板、缩略图…），`false` 不注册 |
| `images` | `ImageSourceInput[]` | 当前打开的文件，显示在左侧文件目录与内容区域；变化时重新加载；对象可带 `group` 按目录分组 |
| `plugins` | `PluginInput` | 追加插件（仅创建时读取） |
| `preset` | `PluginInput \| false` | 替换 baseline 预设 |
| `layout` | `LayoutOptions` | 区域名称、默认宽度、最小/最大宽度、默认折叠、标签/堆叠模式、是否持久化 |
| `settings` / `theme` | | 设置入口 / 主题插件选项，传 `false` 关闭 |
| `instance-id` | `string` | 持久化命名空间，同页多个实例需区分 |
| `storage` | `StorageAdapter \| 'local' \| 'session' \| 'memory' \| false` | 持久化存储 |
| `icons` | `IconConfig` | 图标配置，见 [theming](theming.md) |
| `height` | `string \| number` | 容器高度，默认 `100%` |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `@save` | `SavePayload` | **可返回 Promise**，编辑器等待其完成；reject 即保存失败 |
| `@saved` / `@save-error` | `SavePayload` / `unknown` | 保存成功 / 失败 |
| `@readonly-change` | `boolean` | 只读状态变化 |
| `@dirty-change` | `boolean` | 未保存状态变化 |
| `@ready` | `ArchiveEditor` | 插件全部就绪 |
| `@error` | `{ error, source }` | 插件或命令异常 |

### 实例方法

```ts
const editor = ref<InstanceType<typeof KabelEditor>>();
editor.value.save();              // Promise<{ ok, error? }>
editor.value.setReadonly(true);
editor.value.notify('已保存', { type: 'success' });
await editor.value.confirm('确定删除？');
editor.value.undo(); editor.value.redo();
editor.value.setImages(list); editor.value.getImages();
editor.value.execute('layout.maximize', 'left');
await editor.value.use(() => import('./my-plugin'));
editor.value.unuse('acme:x');
editor.value.getEditor();         // 完整 ArchiveEditor API
```

## `<KabelPanel>`

在模板中声明一个面板，插槽内容通过 `Teleport` 渲染到工作台区域中，**完整保留宿主上下文**（响应式、provide/inject、全局组件、Pinia、Router）。

```vue
<!-- region 可选 left / right，默认 right；区域内没有任何面板时该区域不显示 -->
<KabelPanel id="host.info" region="right" title="文件信息" :order="20">
  <FileInfo />
</KabelPanel>
```

属性：`id`、`title`、`region`（默认 `right`）、`icon`、`order`、`weight`、`actions`。面板在标签切换或区域折叠时保持挂载。

## `<KabelToolbarButton>`

```vue
<KabelToolbarButton id="host.submit" icon="submit" label="提交审核" :order="60" @click="submit" />
<KabelToolbarButton id="host.sep" separator :order="59" />
<KabelToolbarButton id="host.undo" label="撤销" command="kabel.undo" />   <!-- 绑定已有命令，禁用态随命令 -->
```

## 组合式 API

在 `<KabelEditor>` 的后代组件（包括 `KabelPanel` 插槽内容）中：

```ts
import { useKabel, useKabelState } from '@kabel/vue';

const editor = useKabel();                                    // ShallowRef<ArchiveEditor | null>
const dirty = useKabelState((s) => s.history.dirty, false);   // 响应式订阅状态
const page = useKabelState((s) => s.documents.index + 1, 0);
```

## 用 Vue 编写插件视图

```ts
import { vueView } from '@kabel/vue';
ctx.contribute(ExtensionPoints.panels, { id: 'x', region: 'right', title: '关联文件', view: vueView(RelatedFiles) });
```

## 常见问题

- **高度为 0**：`<KabelEditor>` 默认 `height: 100%`，父容器需有确定高度。
- **同页多个实例**：为每个实例设置不同 `instance-id`，否则布局持久化互相覆盖。
- **切换文件**：直接替换 `images`（新数组），编辑器重新加载并回到第一页；文件目录与内容区域随之更新，见 `examples/vue-app/src/App.vue`。
- **宿主 UI 库样式**：Kabel 样式只作用于 `.kb-root` 内部；宿主组件放进 `KabelPanel` 后仍使用宿主自身样式。
