# @kabel/plugin-table · 表格

**通用能力插件**（L2）：传入 **JSON 数据** 或 **接口 URL**，在工作台面板中以表格展示；支持前端 / 后端分页、行选中，并把表格数据作为**表单数据**提交（“查看表单数据”弹窗与 `save` 载荷的 `data`）。开启 **可编辑** 后可新增行、删除行、行内修改并提交；开启 **可多选** 后首列为复选框。

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

## 插件配置 `Config`

设置 › 插件管理 › 表格 › 配置 中可修改，保存后插件重载（编辑中的数据、修改标记与勾选保留）。是**全部表格的默认值**：表格配置里显式写了 `editable` / `multiple` 的以表格配置为准。工厂参数 `tablePlugin({ editable, multiple })` 是注册方给定的默认值，用户在插件管理中保存的配置优先。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `editable` | `false` | 可编辑：新增行、删除行、行内修改、提交 |
| `multiple` | `false` | 可多选行（复选框列） |

```ts
tablePlugin({ editable: true, multiple: true, tables: [...] }); // 全部表格默认可编辑、可多选
tablePlugin({ tables: [{ id: 'materials', editable: true, ... }] }); // 只有这张表可编辑
kernel.plugins.updateConfig('kabel:table', { editable: true, multiple: false }); // 运行期修改插件配置
```

Vue 中同样通过 `<KabelEditor :plugins="[tablePlugin({ tables })]" />` 接入。完整示例见 `examples/vue-app/src/mock/market-regulation.ts`（市场监管 · 企业设立登记档案）。

## 配置 `TableConfig`

“运行期”一列表示能否用 `update(id, patch)` / 命令 `table.update` 动态修改（修改后立即生效，派发 `table:config`）。

| 字段 | 运行期 | 说明 |
| --- | --- | --- |
| `id` | — | 表格标识；面板 id 与表单数据键均为 `table.<id>`。不可修改（需要换 id 时 `remove` 后 `add`） |
| `title` | ✓ | 面板标题与表单数据标题，默认“表格” |
| `columns` | ✓ | 列：`{ key, title, width?, align?, format?, mark?, ellipsis? }`；`key` 支持 `a.b` 嵌套字段；`mark` 为字段名或 `(row) => boolean`（文本后显示红色 ★）；`ellipsis` 默认 true（超出省略、悬停显示全文） |
| `data` | ✓ | JSON 数组，直接展示；运行期传入等同 `setData`（作废进行中的请求、回到第 1 页、清除选中） |
| `url` | ✓ | 数据接口（GET JSON），运行期传入新地址会立即请求第 1 页。兼容：数组；`{ rows \| list \| records \| items \| data: [], total }`；以及外层包 `{ code, data: { … } }` |
| `pagination` | ✓ | `'client'`（默认，前端分页，一次取全量）/ `'server'`（后端分页：请求附加 `page`、`pageSize` 参数，期望返回带 `total` 的分页结构）/ `false`（不分页）。修改后回到第 1 页（后端分页时重新请求） |
| `pageSize` / `pageSizes` | ✓ | 每页条数，默认取 `pageSizes[0]`；可选条数默认 `[10, 20, 50]`。`pageSize` 变化时回到第 1 页 |
| `index` | ✓ | 序号列：`true`（默认，“序号”）/ 自定义标题 / `false` |
| `fetch(url, query)` | ✓ | 自定义请求（如追加鉴权头），返回值交给解析；下一次请求生效 |
| `parse(response, query)` | ✓ | 自定义解析，返回数组或 `{ rows, total }`；下一次请求生效 |
| `panel` | ✓ | 面板的**默认**位置 `{ region?, slot?, order? }`，默认 `{ region: 'left', slot: 'bottom' }`；实际位置以布局为准（`layout.panels` / 摆放贡献 / 用户调整）；`false` 不注册面板（只用服务与表单数据） |
| `submit` | ✓ | 是否作为表单数据提交，默认 true |
| `emptyText` | ✓ | 空数据提示，默认“暂无数据” |
| `editable` | ✓ | 可编辑（新增行 / 删除行 / 行内修改 / 提交），缺省取插件配置；关闭时结束正在进行的编辑 |
| `multiple` | ✓ | 可多选行，缺省取插件配置；关闭时清除勾选 |
| `createRow(table)` | ✓ | 新增行的初始值（在列的 `defaultValue` 之后合并） |
| `onSubmit(payload)` | ✓ | 提交处理（如调用保存接口）：抛错 / 返回 rejected Promise 时提交失败，修改保留 |

列 `TableColumn` 中与编辑相关的字段（均可通过 `update({ columns })` 运行期修改）：

| 字段 | 说明 |
| --- | --- |
| `editable` | 该列能否修改，默认 true（编号、派生列设为 false） |
| `type` | 行内编辑控件：`'text'`（默认）/ `'number'`（值转为数字，空为 null）/ `'date'`（`YYYY-MM-DD`）/ `'select'` |
| `options` | `type: 'select'` 的选项：`string \| number \| { label, value }` |
| `required` | 提交时必填（空字符串、null、undefined 视为未填），表头显示红色 * |
| `defaultValue` | 新增行时该列的初始值 |

**交互**：双击单元格（或选中行后按 Enter）进入编辑；Enter / 失焦写入，Esc 取消，Tab / Shift+Tab 写入并移到下一 / 上一可编辑列。操作条：“新增行”（追加到末尾、跳到所在页并开始编辑第一个可编辑列）、“删除”（删除勾选的行，没有勾选时删除当前行）、“放弃修改”、“提交”（有修改时可用）。修改过的单元格左上角有标记，新增行左侧有色条，必填未填的单元格标红。后端分页时翻页会丢弃当前页未提交的修改（先确认）。只读模式（`kabel.setReadonly`）下不可编辑。整个表单保存成功（`saved`）后修改标记一并清除。

**多选**：首列复选框，表头复选框勾选 / 取消本页全部行（部分勾选时为半选）；勾选行高亮，底部显示“已选 N 条”；可多选时空格键切换当前行的勾选。

`slot: 'bottom'` 是底座布局的通用能力：区域内同时有上半区与下半区面板时上下两组各自成卡片，中间可拖拽调整高度（比例持久化，双击复位），下半区可收起为标题栏；比例默认值由 `layout.regions.<id>.split` 配置（下半区所占比例，默认 0.5）。

## 服务 `TABLE_SERVICE`

| 方法 | 说明 |
| --- | --- |
| `list()` | 已注册的表格 id |
| `add(config)` | 运行期新增表格（同 id 先移除再添加），返回移除函数；派发 `table:add` |
| `update(id, patch)` | 运行期修改配置（与当前配置浅合并，见上表“运行期”列）；派发 `table:config` |
| `remove(id)` | 移除表格（面板、表单数据与状态）；派发 `table:remove` |
| `getConfig(id)` | 当前生效的配置 |
| `setData(id, rows)` | 切换为给定 JSON 数据；派发 `table:load` |
| `load(id, url?)` | 从 URL 加载；不传 url 时重新加载当前接口；派发 `table:load`，失败派发 `error` |
| `setPage(id, page, pageSize?)` | 翻页 / 修改每页条数（后端分页时重新请求） |
| `select(id, index \| null)` | 选中行（`null` 取消）；派发 `table:select` |
| `getState(id)` | `{ rows, total, page, pageSize, loading, error, selected, url, checked, editing, dirty, submitting, invalid }` |
| `getSubmitData(id)` | `{ rows, total, selected, checked?, dirty?, changes? }` |

可编辑（未开启或只读模式下调用会抛错，`isEditable` 可先判断）：

| 方法 | 说明 |
| --- | --- |
| `isEditable(id)` | 当前是否可编辑（表格 / 插件配置开启，且不在只读模式） |
| `addRow(id, row?, index?)` | 新增一行（默认追加到末尾），返回新行下标；派发 `table:row-add` |
| `removeRows(id, indexes?)` | 删除行；不传时删除勾选的行，没有勾选时删除当前选中行；返回删除数；派发 `table:row-remove` |
| `updateCell(id, index, key, value)` | 修改单元格（`key` 支持 `a.b`）；值不变时不派发；派发 `table:cell-change` |
| `updateRow(id, index, patch)` | 逐字段修改一行 |
| `edit(id, { index, key } \| null)` | 开始 / 结束行内编辑 |
| `getChanges(id)` | `{ added, updated: [{ index, row, original }], removed }`，相对上次加载 / 提交 / 保存 |
| `validate(id)` | 校验必填列，返回未通过的 `{ index, key }[]` |
| `submit(id)` | 校验 → `onSubmit` → `table:submit`（可否决）→ 清除修改标记 → `table:submitted`；返回 `{ ok, invalid?, error? }` |
| `revert(id)` | 放弃修改，恢复到上次加载 / 提交时的数据；派发 `table:revert` |

多选（未开启时调用会抛错）：

| 方法 | 说明 |
| --- | --- |
| `isMultiple(id)` | 当前是否可多选 |
| `check(id, indexes)` | 设置勾选的行（覆盖）；派发 `table:check` |
| `toggleCheck(id, index)` | 切换一行的勾选 |
| `checkAll(id, checked, indexes?)` | 勾选 / 取消给定行，不传时为全部行（前端分页时包括其他页） |
| `getChecked(id)` | 已勾选的行 |

下标均为行在 `rows` 中的下标（前端分页为全量下标，后端分页为当前页内下标）；删除行后选中与勾选的下标随行对象自动调整。

并发请求只取最后一次的结果；`setData` 会作废进行中的请求。

## 命令

全部为 `hidden`（需要参数，不进命令面板），供宿主 / 其他插件不 import 本包时调用。

| id | 参数 | 说明 |
| --- | --- | --- |
| `table.reload` | `id` | 重新加载接口数据 |
| `table.update` | `id, patch` | 同 `update` |
| `table.setData` | `id, rows` | 同 `setData` |
| `table.select` | `id, index \| null` | 同 `select` |
| `table.addRow` | `id, row?, index?` | 同 `addRow`（`mutates`，只读模式下禁用） |
| `table.removeRows` | `id, indexes?` | 同 `removeRows`（`mutates`） |
| `table.submit` | `id` | 同 `submit`（`mutates`） |
| `table.revert` | `id` | 同 `revert`（`mutates`） |
| `table.check` | `id, indexes` | 同 `check` |

配置了 `url` 的表格在面板头部提供“刷新”按钮。

## 事件

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `table:add` | `{ id }` | 表格注册（初始配置或 `add`） |
| `table:remove` | `{ id }` | 表格移除（`remove`、同 id 替换、插件停用 / 卸载） |
| `table:config` | `{ id, config, changed }` | `update` 修改配置，`changed` 为本次修改的字段名 |
| `table:load` | `{ id, total }` | 数据就绪：本地数据（初始 / `setData`）或接口返回 |
| `table:select` | `{ id, index, row }` | 选中行变化（点击行、回车 / 空格、`select`）；`row` 为空表示取消选中 |
| `table:row-add` | `{ id, index, row }` | 可编辑：新增了一行 |
| `table:row-remove` | `{ id, indexes, rows }` | 可编辑：删除了行（`indexes` 为删除前的下标） |
| `table:cell-change` | `{ id, index, key, value, oldValue, row }` | 可编辑：单元格值修改（行内编辑、`updateCell` / `updateRow`） |
| `table:submit` | `{ id, rows, changes }` | 可编辑：提交（`emitAsync`）。处理器返回 rejected Promise 即否决，修改保留 |
| `table:submitted` | `{ id, rows, changes }` | 可编辑：提交成功，修改标记已清除 |
| `table:submit-error` | `{ id, error, invalid? }` | 可编辑：提交失败；必填校验未通过时带 `invalid` |
| `table:revert` | `{ id }` | 可编辑：放弃修改 |
| `table:check` | `{ id, indexes, rows }` | 可多选：勾选的行变化（勾选、全选、删除行、放弃修改、关闭多选） |
| `error` | `{ error, source: 'kabel:table:<id>' }` | 接口请求或解析失败（底座通用事件，表格同时显示错误信息） |

## API 调用示例

以下 `kernel` 来自 `editor.kernel`（Vue 中 `<KabelEditor @ready="(editor) => …">` 的 `editor.kernel`）；插件内部用 `inject: [TABLE_SERVICE]` 后从 `ctx.kernel.services` 取服务，事件用 `ctx.bus.on`。

```ts
import { TABLE_SERVICE } from '@kabel/plugin-table';

const table = kernel.services.get(TABLE_SERVICE);

// 1. 新增一个表格（运行期），放在右侧下半区
const dispose = table.add({
  id: 'materials',
  title: '卷内文件目录',
  url: '/api/archive/materials',
  pagination: 'server',
  columns: [
    { key: 'title', title: '文件题名', mark: 'required' },
    { key: 'date', title: '成文日期', width: 100, align: 'center' },
  ],
});
kernel.execute('layout.movePanel', 'table.materials', { region: 'right', slot: 'bottom' });

// 2. 动态修改配置：改标题、增减列、改分页
await table.update('materials', {
  title: '卷内文件目录（已核对）',
  columns: [
    { key: 'title', title: '文件题名', mark: (row) => row.required === true },
    { key: 'responsible', title: '责任者', width: 140 },
    { key: 'pages', title: '页号', width: 80, align: 'center', format: (v) => `第 ${v} 页` },
  ],
  pageSize: 20,
  index: '序',
});

// 3. 切换数据源：换接口（带鉴权）/ 直接给数据 / 刷新
await table.update('materials', {
  url: '/api/archive/materials?archiveId=42',
  fetch: (url) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
});
table.setData('materials', [{ title: '公司章程', date: '2026-08-11' }]);
await table.load('materials'); // 重新请求当前接口（需当前为接口数据源）

// 4. 分页与选中
await table.setPage('materials', 2);      // 第 2 页
await table.setPage('materials', 1, 50);  // 每页 50 条
table.select('materials', 0);             // 选中第 1 行；null 取消

// 5. 读取
table.getConfig('materials');       // 当前配置
table.getState('materials');        // { rows, total, page, pageSize, loading, error, selected, url }
table.getSubmitData('materials');   // { rows, total, selected }，与表单数据 table.materials 相同

// 6. 不提交 / 不显示面板 / 移除
await table.update('materials', { submit: false });
table.remove('materials'); // 或 dispose()

// 7. 不 import 本包时用命令
await kernel.execute('table.update', 'materials', { title: '材料清单' });
await kernel.execute('table.setData', 'materials', rows);
kernel.execute('table.select', 'materials', 3);
kernel.execute('table.reload', 'materials');

// 8. 监听事件
kernel.bus.on('table:select', ({ id, row }) => {
  if (id === 'materials' && row) console.log('选中', row.title);
});
kernel.bus.on('table:load', ({ id, total }) => console.log(id, '共', total, '条'));
kernel.bus.on('table:config', ({ id, changed }) => console.log(id, '修改了', changed));
kernel.bus.on('error', ({ source, error }) => source?.startsWith('kabel:table:') && console.warn(error));

// 9. 可编辑：开启、新增 / 修改 / 删除、提交（提交到后端；reject 即提交失败）
await table.update('materials', {
  editable: true,
  columns: [
    { key: 'title', title: '文件题名', required: true },
    { key: 'date', title: '成文日期', type: 'date', width: 120 },
    { key: 'pages', title: '页数', type: 'number', width: 80, defaultValue: 1 },
    { key: 'kind', title: '类别', type: 'select', options: ['申请材料', '证照', '决议'] },
    { key: 'no', title: '编号', editable: false },
  ],
  createRow: (t) => ({ no: t.total + 1 }),
  onSubmit: ({ rows, changes }) => api.saveMaterials({ rows, ...changes }),
});
const at = table.addRow('materials', { title: '补充材料' });
table.updateCell('materials', at, 'pages', 3);
table.updateRow('materials', 0, { title: '公司章程（修正）', kind: '决议' });
table.removeRows('materials', [5]);
table.getChanges('materials'); // { added, updated, removed }
const result = await table.submit('materials'); // { ok: false, invalid: [{ index, key }] } 表示必填未填
table.revert('materials');                       // 放弃修改

kernel.bus.on('table:cell-change', ({ id, key, value, oldValue }) => console.log(id, key, oldValue, '→', value));
kernel.bus.on('table:row-add', ({ id, index }) => console.log(id, '新增第', index + 1, '行'));
kernel.bus.on('table:row-remove', ({ id, rows }) => console.log(id, '删除', rows.length, '行'));
// 也可在事件里提交（多个监听者依次等待，任一 reject 即提交失败）
kernel.bus.on('table:submit', async ({ id, changes }) => {
  const res = await fetch(`/api/tables/${id}`, { method: 'POST', body: JSON.stringify(changes) });
  if (!res.ok) throw new Error(`保存失败：${res.status}`);
});
kernel.bus.on('table:submitted', ({ id }) => console.log(id, '已提交'));
kernel.bus.on('table:submit-error', ({ id, error, invalid }) => console.warn(id, error, invalid));

// 10. 可多选：开启、勾选、读取、批量删除
await table.update('materials', { multiple: true });
table.check('materials', [0, 2, 3]);
table.toggleCheck('materials', 1);
table.checkAll('materials', true);   // 全选（含其他页）
table.checkAll('materials', false);  // 全不选
table.getChecked('materials');       // 勾选的行
table.removeRows('materials');       // 可编辑时删除勾选的行
kernel.bus.on('table:check', ({ id, rows }) => console.log(id, '已选', rows.length, '行'));
await kernel.execute('table.check', 'materials', [0, 1]); // 不 import 本包时

// 11. 与工作台联动（由宿主或业务插件完成，表格插件本身不依赖工作台）：行数据里带文件下标时，选中即切换影像
kernel.bus.on('table:select', ({ row }) => {
  if (typeof row?.documentIndex === 'number') kernel.execute('workspace.goto', row.documentIndex);
});
```

## 表单数据与表单配置

每个表格贡献 `ExtensionPoints.formData`，键 `table.<id>`，内容：

```json
{ "rows": [ … ], "total": 8, "selected": { "title": "原许可证正/副本复印件", … } }
```

可多选时增加 `checked`（勾选的行）；可编辑时增加 `dirty` 与 `changes`（`{ added, updated, removed }`）。

前端分页时 `rows` 为全量数据；后端分页时为当前页数据，`total` 为接口返回的总数。

插件同时贡献 `ExtensionPoints.formConfig`（键 `table`）：各表格当前生效的配置（`data` 显示为行数，函数显示为 `ƒ name`），在“查看表单数据 › 表单配置”中查看，或 `editor.getFormConfig()` 获取。

## 状态

`state.table[id]`：见 `getState`。不纳入撤销。

## 样式

类名前缀 `kb-dt`，颜色尺寸使用 `--kb-*` 令牌；选中行使用 `--kb-color-primary-soft`，星标使用 `--kb-color-danger`。
