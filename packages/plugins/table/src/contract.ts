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
}

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
}

export interface TableService {
  /** 已注册的表格 id */
  list(): string[];
  /** 运行期新增一个表格，返回移除函数 */
  add(config: TableConfig): () => void;
  /** 替换为给定 JSON 数据（切换为本地数据源） */
  setData(id: string, rows: readonly TableRow[]): void;
  /** 从 URL 加载；不传 url 时重新加载当前接口 */
  load(id: string, url?: string): Promise<void>;
  setPage(id: string, page: number, pageSize?: number): Promise<void>;
  select(id: string, index: number | null): void;
  getState(id: string): TableState | undefined;
  /** 当前提交数据：`{ rows, total, selected }` */
  getSubmitData(id: string): TableSubmit | undefined;
}

/** 表格提交的数据 */
export interface TableSubmit {
  rows: TableRow[];
  total: number;
  selected: TableRow | null;
}

export const TABLE_SERVICE = createServiceToken<TableService>('kabel.table');

declare module '@kabel/core' {
  interface KabelEvents {
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
  }
}
