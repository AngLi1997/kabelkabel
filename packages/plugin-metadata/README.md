# @kabel/plugin-metadata · 文书著录

Schema 驱动的著录表单插件（插件名 `kabel:metadata`，插件管理中显示为“文书著录”）。面板位于工作台右侧“著录信息”标签页，提供字段编辑、校验、保存流程、AI 填充入口与著录项设置。

## 功能

- **Schema 驱动表单**：分组、栅格列数（随容器宽度自动减少）、必填 / 只读 / 隐藏、默认值；内置 `text`、`textarea`、`number`、`date`、`select`、`radio`、`checkbox` 字段类型，可通过扩展点 `FieldTypes` 新增或覆盖。
- **校验**：必填、`min` / `max` / `maxLength` / `pattern`、自定义 `validator`、字段类型级校验；只对交互过的字段显示错误，执行整体校验后显示全部。
- **撤销 / 重做**：著录值（`record` 切片）纳入历史，连续输入自动合并。
- **保存**：`kabel.save`（`Mod+S`）→ 校验 → `emitAsync('save')` 等待宿主处理 → 标记已保存；宿主抛错即保存失败。
- **面板工具条**（面板顶部右侧）：
  - **AI 填充**：由 `aiFill` 选项提供实现，返回的值以一条历史写入；未提供时按钮不可用。
  - **元数据设置**：打开 设置 › 著录项。
  - **展开 / 收起全部分组**。
- **设置 › 著录项**：查看字段（名称、标识、类型），切换必填 / 显示，导入 / 导出 Schema JSON，恢复初始方案；修改后派发 `schema:change`。
- **状态栏**：保存状态、必填进度、待修正数量（点击定位到第一个错误）。

## 集成

### 通过主包（推荐）

`createArchiveEditor` / `<KabelEditor>` 在传入 `schema`、`record` 或 `metadata` 配置时自动启用本插件：

```ts
import { createArchiveEditor } from '@kabel/editor';
import '@kabel/editor/style.css';

const editor = createArchiveEditor('#app', {
  schema,
  record,
  metadata: {
    allowInvalidSave: false,
    aiFill: async (kernel) => api.recognize(kernel.services.get(VIEWER_SERVICE).current()),
  },
});
editor.on('save', ({ record }) => api.save(record));
editor.on('schema:change', ({ schema }) => api.saveSchema(schema));
```

```vue
<KabelEditor v-model:record="record" :schema="schema" :metadata="{ aiFill }" @save="onSave" />
```

传 `metadata: false` 可强制关闭。

### 单独组合

```ts
import { createKernel, historyPlugin } from '@kabel/core';
import { layoutPlugin, mountWorkbench, settingsPlugin } from '@kabel/ui';
import { metadataPlugin } from '@kabel/plugin-metadata';
import '@kabel/ui/style.css';
import '@kabel/plugin-metadata/style.css';

const kernel = createKernel({ plugins: [layoutPlugin(), historyPlugin(), settingsPlugin(), metadataPlugin({ schema, record })] });
mountWorkbench(el, kernel);
```

## 配置 `MetadataPluginOptions`

| 选项 | 说明 |
| --- | --- |
| `schema` | `SchemaInput`：完整结构 / 分组数组 / 字段数组 / `{ fields }` / JSON 字符串 |
| `record` | `RecordInput`：`{ id?, values }` / 纯值对象 / JSON 字符串 |
| `readonly` | 只读 |
| `allowInvalidSave` | 存在校验错误时是否仍允许保存，默认 `false` |
| `aiFill(kernel)` | AI 填充实现，返回要写入的著录值（可异步）；未提供时按钮不可用 |
| `panel` | 覆盖面板 `title` / `region` / `order`（默认 `著录信息` / `right` / `20`） |

Schema 字段说明见 [API 参考](../../docs/api.md#schemainput)。

## 命令

| 命令 | 快捷键 | 说明 |
| --- | --- | --- |
| `kabel.save` | `Mod+S` | 校验并保存 |
| `metadata.validate` | | 整体校验 |
| `metadata.aiFill` | | AI 填充 |
| `metadata.openSettings` | | 打开 设置 › 著录项（需要设置插件） |
| `metadata.resetSchema` | | 恢复初始著录项方案 |
| `metadata.focusField(key)` | | 定位字段（显示面板、展开分组、聚焦） |
| `metadata.focusFirstError` | | 定位第一个错误 |
| `metadata.toggleAllGroups` | | 展开 / 收起全部分组 |

## 服务 `METADATA_SERVICE`

```ts
const md = kernel.services.get(METADATA_SERVICE);
md.getSchema(); md.setSchema(input);
md.getRecord(); md.setRecord(input);          // 载入档案：重置校验、清空撤销栈
md.getValue(key); md.setValue(key, value, label?); md.setValues(values, label?);
md.setReadonly(true); md.validate(); md.focusField(key);
```

## 事件

`record:change`、`save`（可异步否决）、`saved`、`save:error`、`validate`、`field:focus`、`schema:change`。

## 状态切片

| 切片 | 撤销 | 内容 |
| --- | --- | --- |
| `record` | ✓ | `{ id?, values }` |
| `metadata` | | `schema, readonly, collapsed, touched, errors, validatedAt, saving, savedAt, saveError, filling` |

## 扩展：自定义字段类型

```tsx
import { FieldTypes, Select, type FieldViewProps } from '@kabel/plugin-metadata';

ctx.contribute(FieldTypes, {
  id: 'fonds',            // Schema 中 type: 'fonds'
  title: '全宗',           // 著录项设置中显示的类型名
  view: ({ id, value, onChange, onBlur, disabled, invalid }: FieldViewProps) => (
    <Select id={id} value={value as string} options={fondsOptions} onChange={onChange} onBlur={onBlur} disabled={disabled} invalid={invalid} />
  ),
  validate: (value, field) => (/^[A-Z]\d{3}$/.test(String(value)) ? null : `${field.label}格式不正确`),
});
```

字段视图必须把 `id` 放在可聚焦元素上（`focusField` 依赖它）。

## 样式

`@kabel/plugin-metadata/style.css`（已包含在 `@kabel/editor/style.css` 中）。
