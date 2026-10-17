# @kabel/plugin-table · 表格

**通用能力插件**（L2）：传入 **JSON 数据** 或 **接口 URL**，在工作台面板中以表格展示；支持前端 / 后端分页、行选中，并把表格数据作为**表单数据**提交（“查看表单数据”弹窗与 `save` 载荷的 `data`）。

- 不依赖任何插件，不含业务含义：“卷内文件目录”“材料清单”等都只是宿主 / 场景传入的一份表格配置；
- 面板位置由**布局**决定：`panel` 只是默认位置（左侧下半区），场景 / 宿主用 `layout.panels['table.<id>']` 指定，用户可在面板标题栏右键“移到…”。

## 集成

```ts
import { createArchiveEditor } from '@kabel/editor';
import { tablePlugin } from '@kabel/plugin-table';
import '@kabel/editor/style.css'; // 已包含本插件样式；单独使用时引入 '@kabel/plugin-table/style.css'

createArchiveEditor('#app', {
  plugins: [
    tablePlugin({
      tables: [
        {
          id: 'materials',
          title: '卷内文件目录',
          // 二选一：直接传 JSON 数组，或给出接口地址
          data: [{ title: '公司章程', responsible: '四川星辰信息技术有限公司', date: '2026-08-11', pages: '13-22', required: true }],
          // url: '/api/archive/materials',
          columns: [
            { key: 'title', title: '文件题名', mark: 'required' },   // mark：文本后显示红色 ★
            { key: 'responsible', title: '责任者', width: 140, align: 'center' },
            { key: 'date', title: '成文日期', width: 100, align: 'center' },
            { key: 'pages', title: '纸质页号', width: 80, align: 'center' },
          ],
        },
      ],
    }),
  ],
  // 面板位置由布局指定（按面板 id `table.<id>`），不写在表格配置里
  layout: { panels: { 'table.materials': { region: 'left', slot: 'bottom' } } },
});
```

Vue 中同样通过 `<KabelEditor :plugins="[tablePlugin({ tables })]" />` 接入。完整示例见 `examples/vue-app/src/mock/market-regulation.ts`（市场监管 · 企业设立登记档案）。

## 配置 `TableConfig`

| 字段 | 说明 |
| --- | --- |
| `id` | 表格标识；面板 id 与表单数据键均为 `table.<id>` |
| `title` | 面板标题，默认“表格” |
| `columns` | 列：`{ key, title, width?, align?, format?, mark?, ellipsis? }`；`key` 支持 `a.b` 嵌套字段；`mark` 为字段名或 `(row) => boolean`；`ellipsis` 默认 true（超出省略、悬停显示全文） |
| `data` | JSON 数组，直接展示 |
| `url` | 数据接口（GET JSON）。兼容：数组；`{ rows \| list \| records \| items \| data: [], total }`；以及外层包 `{ code, data: { … } }` |
| `pagination` | `'client'`（默认，前端分页，一次取全量）/ `'server'`（后端分页：请求附加 `page`、`pageSize` 参数，期望返回带 `total` 的分页结构）/ `false`（不分页） |
| `pageSize` / `pageSizes` | 每页条数，默认取 `pageSizes[0]`；可选条数默认 `[10, 20, 50]` |
| `index` | 序号列：`true`（默认，“序号”）/ 自定义标题 / `false` |
| `fetch(url, query)` | 自定义请求（如追加鉴权头），返回值交给解析 |
| `parse(response, query)` | 自定义解析，返回数组或 `{ rows, total }` |
| `panel` | 面板的**默认**位置 `{ region?, slot?, order? }`，默认 `{ region: 'left', slot: 'bottom' }`；实际位置以布局为准（`layout.panels` / 摆放贡献 / 用户调整）；`false` 不注册面板（只用服务与表单数据） |
| `submit` | 是否作为表单数据提交，默认 true |
| `emptyText` | 空数据提示 |

`slot: 'bottom'` 是底座布局的通用能力：区域内同时有上半区与下半区面板时上下两组各自成卡片，中间可拖拽调整高度（比例持久化，双击复位），下半区可收起为标题栏；比例默认值由 `layout.regions.<id>.split` 配置（下半区所占比例，默认 0.5）。

## 服务 `TABLE_SERVICE`

| 方法 | 说明 |
| --- | --- |
| `add(config)` | 运行期新增表格，返回移除函数 |
| `list()` | 已注册的表格 id |
| `setData(id, rows)` | 切换为给定 JSON 数据 |
| `load(id, url?)` | 从 URL 加载；不传 url 时重新加载当前接口 |
| `setPage(id, page, pageSize?)` | 翻页 / 修改每页条数（后端分页时重新请求） |
| `select(id, index \| null)` | 选中行 |
| `getState(id)` | `{ rows, total, page, pageSize, loading, error, selected, url }` |
| `getSubmitData(id)` | `{ rows, total, selected }` |

并发请求只取最后一次的结果；`setData` 会作废进行中的请求。

## 命令

| id | 说明 |
| --- | --- |
| `table.reload` | 重新加载接口数据（参数：表格 id；`hidden`） |

配置了 `url` 的表格在面板头部提供“刷新”按钮。

## 表单数据

每个表格贡献 `ExtensionPoints.formData`，键 `table.<id>`，内容：

```json
{ "rows": [ … ], "total": 8, "selected": { "title": "原许可证正/副本复印件", … } }
```

前端分页时 `rows` 为全量数据；后端分页时为当前页数据，`total` 为接口返回的总数。

## 事件

| 事件 | 载荷 |
| --- | --- |
| `table:load` | `{ id, total }` |
| `table:select` | `{ id, index, row }`（`row` 为空表示取消选中） |

## 状态

`state.table[id]`：见 `getState`。不纳入撤销。

## 样式

类名前缀 `kb-dt`，颜色尺寸使用 `--kb-*` 令牌；选中行使用 `--kb-color-primary-soft`，星标使用 `--kb-color-danger`。
