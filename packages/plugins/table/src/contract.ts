import { createServiceToken, type PanelSlot, type RegionId } from '@kabel/core';

export const TABLE_PLUGIN = 'kabel:table';

/** 一行数据：任意 JSON 对象 */
export type TableRow = Record<string, unknown>;

export interface TableColumn {
  /** 字段名，支持 `a.b` 取嵌套字段 */
  key: string;
  title: string;
  /** 列宽（px 或 CSS 长度），不设置时自动分配 */
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  /** 单元格文本，默认为字段值的字符串形式 */
  format?: (value: unknown, row: TableRow, index: number) => string;
  /** 为 true 时在文本后显示红色星标（如必备材料、重点件）；可传字段名或判断函数 */
  mark?: string | ((row: TableRow) => boolean);
  /** 超出列宽时省略并以悬停提示显示全文，默认 true */
  ellipsis?: boolean;
  /** 可编辑表格中该列能否修改，默认 true（只读的派生列设为 false） */
  editable?: boolean;
  /** 行内编辑控件，默认 `text` */
  type?: TableCellType;
  /** `type: 'select'` 的选项 */
  options?: (string | number | { label: string; value: string | number })[];
  /** 提交时必填（空字符串、null、undefined 视为未填） */
  required?: boolean;
  /** 新增行时该列的初始值 */
  defaultValue?: unknown;
}

/** 行内编辑控件 */
export type TableCellType = 'text' | 'number' | 'date' | 'select';

/** 分页查询参数（后端分页时附加到 URL 上，或交给自定义 `fetch`） */
export interface TableQuery {
  page: number;
  pageSize: number;
}

/** 接口返回的分页结果 */
export interface TablePage {
  rows: TableRow[];
  total: number;
}

export interface TableConfig {
  /** 表格标识：服务方法、表单数据键（`table.<id>`）与面板 id 都由它派生 */
  id: string;
  /** 面板标题，默认“表格” */
  title?: string;
  columns: TableColumn[];
  /** 直接传入的 JSON 数据（数组） */
  data?: readonly TableRow[];
  /** 数据接口地址：返回数组，或 `{ rows | list | records | items | data, total }`（可嵌套在 `data` 中） */
  url?: string;
  /**
   * 分页方式：`client` 前端分页（默认，一次取全量）；`server` 后端分页
   * （请求时附加 `page`、`pageSize` 参数，期望返回 `{ rows, total }`）；`false` 不分页。
   */
  pagination?: 'client' | 'server' | false;
  pageSize?: number;
  /** 可选的每页条数，默认 [10, 20, 50] */
  pageSizes?: number[];
  /** 序号列：`true`（默认，标题“序号”）、自定义标题，或 `false` 不显示 */
  index?: boolean | string;
  /** 自定义请求（如追加鉴权头）；返回值交给 `parse` */
  fetch?: (url: string, query: TableQuery) => Promise<unknown>;
  /** 自定义解析接口响应 */
  parse?: (response: unknown, query: TableQuery) => TableRow[] | TablePage;
  /** 面板位置，默认左侧下半区 `{ region: 'left', slot: 'bottom' }`；`false` 不注册面板 */
  panel?: { region?: RegionId; slot?: PanelSlot; order?: number } | false;
  /** 是否作为表单数据提交（“查看表单数据”与 `save` 载荷），默认 true */
  submit?: boolean;
  /** 空数据提示，默认“暂无数据” */
  emptyText?: string;
  /** 可编辑：新增行、删除行、行内修改、提交。缺省取插件配置 `editable`（设置 › 插件管理 › 表格） */
  editable?: boolean;
  /** 可多选行（复选框列）。缺省取插件配置 `multiple` */
  multiple?: boolean;
  /** 新增行的初始值（在列的 `defaultValue` 之后合并） */
  createRow?: (table: TableState) => TableRow;
  /** 提交处理（可编辑表格点击“提交”或调用 `submit`）：返回 rejected Promise / 抛错时提交失败，修改保留 */
  onSubmit?: (payload: TableSubmitPayload) => unknown;
}

/** 插件配置（`Config`，设置 › 插件管理 › 表格 › 配置）：各表格未显式设置时的默认值 */
export interface TablePluginConfig {
  /** 可编辑（新增行、删除行、行内修改、提交） */
  editable: boolean;
  /** 可多选行 */
  multiple: boolean;
}

/** 单元格位置：`index` 为行在 `rows` 中的下标（后端分页时为当前页内下标） */
export interface TableCellRef {
  index: number;
  key: string;
}

/** 自上次加载 / 提交 / 保存以来的修改 */
export interface TableChanges {
  /** 新增的行 */
  added: TableRow[];
  /** 修改过的已有行：当前下标、当前值与原值 */
  updated: { index: number; row: TableRow; original: TableRow }[];
  /** 删除的已有行（原值） */
  removed: TableRow[];
}

/** `table:submit` / `onSubmit` 的载荷 */
export interface TableSubmitPayload {
  id: string;
  /** 提交后的全部行 */
  rows: TableRow[];
  changes: TableChanges;
}

/** `submit` 的结果 */
export interface TableSubmitResult {
  ok: boolean;
  /** 校验未通过的单元格 */
  invalid?: TableCellRef[];
  error?: unknown;
}

/** 单个表格的运行状态（存于 `state.table[id]`） */
export interface TableState {
  /** 前端分页时为全量数据，后端分页时为当前页数据 */
  rows: TableRow[];
  total: number;
  /** 当前页，从 1 开始 */
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  /** 选中行在全量数据中的下标（后端分页时为当前页内下标） */
  selected: number | null;
  /** 当前数据接口 */
  url: string | null;
  /** 多选：已勾选行的下标（升序） */
  checked: number[];
  /** 正在行内编辑的单元格 */
  editing: TableCellRef | null;
  /** 有未提交的修改 */
  dirty: boolean;
  /** 提交中 */
  submitting: boolean;
  /** 上次提交校验未通过的单元格 */
  invalid: TableCellRef[];
}

/** 运行期可修改的配置（`update` 的参数，与当前配置浅合并） */
export type TablePatch = Partial<Omit<TableConfig, 'id'>>;

export interface TableService {
  /** 已注册的表格 id */
  list(): string[];
  /** 运行期新增一个表格（同 id 先移除再添加），返回移除函数 */
  add(config: TableConfig): () => void;
  /** 运行期修改配置：标题、列、分页、序号列、提交、空数据提示、面板默认位置、数据源（`data` / `url`）、`fetch` / `parse` */
  update(id: string, patch: TablePatch): Promise<void>;
  /** 移除表格（面板、表单数据与状态） */
  remove(id: string): void;
  /** 当前生效的配置 */
  getConfig(id: string): TableConfig | undefined;
  /** 替换为给定 JSON 数据（切换为本地数据源） */
  setData(id: string, rows: readonly TableRow[]): void;
  /** 从 URL 加载；不传 url 时重新加载当前接口 */
  load(id: string, url?: string): Promise<void>;
  setPage(id: string, page: number, pageSize?: number): Promise<void>;
  select(id: string, index: number | null): void;
  getState(id: string): TableState | undefined;
  /** 当前提交数据：`{ rows, total, selected, checked?, dirty?, changes? }` */
  getSubmitData(id: string): TableSubmit | undefined;

  // ---------- 可编辑（`editable`） ----------

  /** 表格当前是否可编辑（表格配置 / 插件配置，且不在只读模式） */
  isEditable(id: string): boolean;
  /** 新增一行（默认追加到末尾并开始编辑第一个可编辑列），返回新行下标 */
  addRow(id: string, row?: TableRow, index?: number): number;
  /** 删除行；不传下标时删除勾选的行，没有勾选时删除当前选中行。返回删除的行数 */
  removeRows(id: string, indexes?: number[]): number;
  /** 修改单元格（`key` 支持 `a.b`）；值不变时不派发事件 */
  updateCell(id: string, index: number, key: string, value: unknown): void;
  /** 合并修改一行 */
  updateRow(id: string, index: number, patch: TableRow): void;
  /** 开始 / 结束行内编辑 */
  edit(id: string, cell: TableCellRef | null): void;
  /** 自上次加载 / 提交 / 保存以来的修改 */
  getChanges(id: string): TableChanges;
  /** 校验必填列，返回未通过的单元格 */
  validate(id: string): TableCellRef[];
  /** 提交：校验 → `onSubmit` → `table:submit`（可否决）→ 清除修改标记 → `table:submitted` */
  submit(id: string): Promise<TableSubmitResult>;
  /** 放弃修改，恢复到上次加载 / 提交时的数据 */
  revert(id: string): void;

  // ---------- 多选（`multiple`） ----------

  /** 表格当前是否可多选 */
  isMultiple(id: string): boolean;
  /** 设置勾选的行（覆盖） */
  check(id: string, indexes: number[]): void;
  /** 切换一行的勾选 */
  toggleCheck(id: string, index: number): void;
  /** 勾选 / 取消勾选给定行，不传时为全部行（前端分页时也包括其他页） */
  checkAll(id: string, checked: boolean, indexes?: number[]): void;
  /** 已勾选的行 */
  getChecked(id: string): TableRow[];
}

/** 表格提交的数据 */
export interface TableSubmit {
  rows: TableRow[];
  total: number;
  selected: TableRow | null;
  /** 多选表格：勾选的行 */
  checked?: TableRow[];
  /** 可编辑表格：是否有未提交的修改 */
  dirty?: boolean;
  /** 可编辑表格：自上次加载 / 提交以来的修改 */
  changes?: TableChanges;
}

export const TABLE_SERVICE = createServiceToken<TableService>('kabel.table');

declare module '@kabel/core' {
  interface KabelEvents {
    /**
     * 表格已注册（初始配置或 `add`）。
     * @mode emit
     */
    'table:add': { id: string };
    /**
     * 表格已移除（`remove`、`add` 同 id 替换、插件停用）。
     * @mode emit
     */
    'table:remove': { id: string };
    /**
     * 数据已加载（本地数据或接口返回）。
     * @mode emit
     */
    'table:load': { id: string; total: number };
    /**
     * 选中行变化；`row` 为空表示取消选中。
     * @mode emit
     */
    'table:select': { id: string; index: number | null; row: TableRow | null };
    /**
     * 配置已修改（`update` / 命令 `table.update`）；`changed` 为本次修改的字段名。
     * @mode emit
     */
    'table:config': { id: string; config: TableConfig; changed: string[] };
    /**
     * 可编辑：新增了一行。
     * @mode emit
     */
    'table:row-add': { id: string; index: number; row: TableRow };
    /**
     * 可编辑：删除了行（`indexes` 为删除前的下标）。
     * @mode emit
     */
    'table:row-remove': { id: string; indexes: number[]; rows: TableRow[] };
    /**
     * 可编辑：单元格值修改（行内编辑、`updateCell` / `updateRow`）。
     * @mode emit
     */
    'table:cell-change': { id: string; index: number; key: string; value: unknown; oldValue: unknown; row: TableRow };
    /**
     * 可编辑：提交。处理器返回 rejected Promise 即否决提交（修改保留，派发 `table:submit-error`）。
     * @mode emitAsync
     */
    'table:submit': TableSubmitPayload;
    /**
     * 可编辑：提交成功，修改标记已清除。
     * @mode emit
     */
    'table:submitted': TableSubmitPayload;
    /**
     * 可编辑：提交失败（必填校验未通过时带 `invalid`）。
     * @mode emit
     */
    'table:submit-error': { id: string; error: unknown; invalid?: TableCellRef[] };
    /**
     * 可编辑：放弃修改，已恢复到上次加载 / 提交时的数据。
     * @mode emit
     */
    'table:revert': { id: string };
    /**
     * 可多选：勾选的行变化。
     * @mode emit
     */
    'table:check': { id: string; indexes: number[]; rows: TableRow[] };
  }
}
