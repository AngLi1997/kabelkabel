# @kabel/plugin-data-exchange · 数据对接（业务插件）

把当前数据（字段值、来源与复核状态、文件列表）导出为 **JSON / YAML** 交给业务层提交，或把文件 / 文本载入字段，用来和接口对接。

插件**只做数据转换**：不发请求、不做持久化。工具栏「加载数据」从本地文件或粘贴文本载入；业务层仍通过 `request()` / `data-exchange:load` 提供数据。提交到哪里由业务层在 `data-exchange:submit` 里决定。

插件名 `kabel:data-exchange`，`inject: { required: [FIELDS_SERVICE], optional: [WORKSPACE_SERVICE] }`。

## 集成

```ts
import { dataExchangePlugin } from '@kabel/plugin-data-exchange';

const editor = createArchiveEditor(el, {
  plugins: [fieldsPlugin({ groups }), catalogPlugin(), dataExchangePlugin({ controls: ['load', 'view', 'export'], format: 'yaml' })],
});

// 加载：返回对象或 JSON / YAML 文本（可为 Promise），返回 undefined 表示不处理
editor.on('data-exchange:load', async () => (await fetch('/api/archive/1')).text());
// 导出：返回的 Promise 被等待，reject 表示导出失败（插件提示“导出失败：…”）
editor.on('data-exchange:submit', async ({ text, mime }) => {
  const res = await fetch('/api/archive/1', { method: 'PUT', headers: { 'Content-Type': mime }, body: text });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});
```

在 `@kabel/plugin-market-supervision` 中作为子插件默认启用（`exchange` 参数，`false` 关闭）。

## 配置

在 设置 › 插件管理 › 数据对接 中编辑（工厂参数作为注册方配置）：

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `controls` | `['load', 'view', 'export']` | 工具栏显示的控件（多选，按顺序，样式一致）：`load` 加载数据（按 `format` 选择文件或粘贴文本）/ `view` 查看数据 / `export` 导出数据（接口提交） |
| `format` | `json` | 数据格式：`json` / `yaml` |
| `items` | `['fields']` | 数据项（多选）：`fields` 字段值 / `review` 来源与复核状态（仅导出）/ `documents` 文件列表 |
| `fieldsPath` | `fields` | 字段值在数据中的路径，`a.b` 嵌套；留空放在根上 |
| `mapping` | `[]` | 字段对照表：`field` 字段标识 ⇄ `path` 接口字段（`a.b` 嵌套，留空同字段标识），`submit` / `load` 控制方向。为空时按字段标识交换全部字段；不为空时只交换表中的字段 |
| `skipEmpty` | `false` | 导出时省略空值（默认输出为 `null`） |
| `validate` | `true` | 业务层调用 `submit()` 与保存时导出前校验必填，未通过时定位到第一个错误字段且不导出。工具栏「导出数据」不拦截 |
| `submitOnSave` | `false` | 保存（`kabel.save` / `Mod+S`）时导出：并入保存契约，导出成功才标记为已保存 |
| `confirmLoad` | `true` | 有未保存修改时，加载前确认 |
| `filename` | `archive` | 建议的文件名（不含扩展名），随导出内容交给业务层 |

## 数据结构

默认配置下的导出（`items: ['fields', 'review', 'documents']`）：

```yaml
fields:
  subjectName: 四川星辰信息技术有限公司
  approveDate: 2026-08-11
  paperPages: 4
review:
  subjectName: { source: ai, review: pending, confidence: 0.92 }
documents:
  - { id: a1, name: 申请书-01.jpg, group: 企业设立登记申请书, url: https://oss.example.com/a1.jpg }
```

- 字段值按字段类型规整（日期 `YYYY-MM-DD`、数字、选项）；载入时同样规整，来源记为 `host`，不入撤销栈（`FIELDS_SERVICE.load`）。
- 文件列表导出时省略 `blob:` / `data:` 地址；载入时带 `url` 的条目交给 `WORKSPACE_SERVICE.setImages`（需配置包含 `documents`）。
- 载入时数据中未出现的字段被清空（一份数据即一份档案）。

## 命令

| 命令 | 说明 |
| --- | --- |
| `dataExchange.load` | 加载数据（`mutates`）：打开底座弹窗 `dataExchange.loader`（`LOADER_DIALOG`）。按 `format` 选择 `.json` 或 `.yaml` / `.yml`，或粘贴文本，确认后载入字段。不派发 `data-exchange:load` |
| `dataExchange.apply` | 内部命令（`hidden`）：载入弹窗中的文本，成功后关闭弹窗 |
| `dataExchange.view` | 查看数据：按当前配置序列化，在底座弹窗 `dataExchange.preview`（`PREVIEW_DIALOG`，参数 `{ text }`）中展示，不提交 |
| `dataExchange.export` | 导出数据：序列化 → `data-exchange:submit` 交给业务层（不校验字段） |

三个控件显示在工具栏右侧，使用相同的文字按钮样式。两个弹窗只向 `ExtensionPoints.dialogs` 贡献内容，经 `DIALOG_SERVICE` 打开；遮罩、拖动、关闭、焦点等行为由底座（`kabel:feedback`）统一定义，载入过程中弹窗不可关闭。

## 服务 `DATA_EXCHANGE_SERVICE`

| 方法 | 说明 |
| --- | --- |
| `collect()` | 按配置收集当前数据（对象） |
| `export(format?)` | 收集并序列化：`{ format, data, text, mime, filename }` |
| `parse(text, format?)` | 解析 JSON / YAML 文本 |
| `load(input, format?)` | 载入对象或文本，返回 `{ fields, documents }` |
| `request()` | 向业务层请求数据并载入（`data-exchange:load`）；没有处理器或返回空时为 `null`。工具栏按钮不调用它 |
| `submit(format?)` | 校验后导出并交给业务层；未通过校验或提交失败时 reject |

## 事件

| 事件 | 方式 | 载荷 |
| --- | --- | --- |
| `data-exchange:load` | `emitAsync` | `{ format }`，处理器返回数据 |
| `data-exchange:submit` | `emitAsync` | `{ format, data, text, mime, filename }`，reject 即失败 |
| `data-exchange:loaded` | `emit` | `{ fields, documents }` |
| `data-exchange:submitted` | `emit` | 同 `data-exchange:submit` |

## 状态

切片 `dataExchange`（不入撤销）：`busy`（`load` / `submit` / `null`，进行中时控件禁用）。弹窗的打开状态由底座维护（`DIALOG_SERVICE.isOpen(LOADER_DIALOG)`）。
