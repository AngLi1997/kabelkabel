import { definePlugin, ExtensionPoints, type Disposable, type Kernel } from '@kabel/core';
import { WORKSPACE_PLUGIN } from '@kabel/plugin-workspace';
import {
  DATA_TABLE_PLUGIN,
  DATA_TABLE_SERVICE,
  type DataTableConfig,
  type DataTableQuery,
  type DataTableRow,
  type DataTableService,
  type DataTableState,
  type DataTableSubmit,
} from './contract';
import { dataTableActions, dataTableSlice } from './slice';
import { fetchJson, parseResponse, pageCount, toPage, withQuery } from './source';
import { DataTable } from './DataTable';

export interface DataTablePluginOptions {
  /** 初始注册的表格；也可运行期通过 `DATA_TABLE_SERVICE.add` 增加 */
  tables?: DataTableConfig[];
}

const DEFAULT_PAGE_SIZES = [10, 20, 50];
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 表单数据与面板的 id */
export const dataTablePanelId = (id: string) => `dataTable.${id}`;

/**
 * 数据表格：业务端传入 JSON 数据或接口 URL，在工作台面板中以表格展示，支持前端/后端分页与行选中。
 *
 * - **数据源**：`data`（数组）或 `url`（GET JSON，兼容常见分页返回结构）；运行期用服务 `setData` / `load` 切换；
 * - **位置**：默认放在左侧下半区（`panel: { region: 'left', slot: 'bottom' }`），可配置到任意区域；
 * - **提交**：每个表格以 `dataTable.<id>` 贡献到 `ExtensionPoints.formData`，内容为 `{ rows, total, selected }`；
 * - **对接**：只依赖 `kabel:workspace`，选中行派发 `data-table:select`，加载完成派发 `data-table:load`。
 */
export const dataTablePlugin = (options: DataTablePluginOptions = {}) =>
  definePlugin({
    name: DATA_TABLE_PLUGIN,
    title: '数据表格',
    dependencies: [WORKSPACE_PLUGIN],
    setup(ctx) {
      const { kernel } = ctx;
      ctx.registerSlice(dataTableSlice);
      const configs = new Map<string, DataTableConfig>();
      const disposers = new Map<string, Disposable[]>();
      const generations = new Map<string, number>();
      const tableOf = (id: string) => kernel.getState().dataTable?.[id];
      const configOf = (id: string) => {
        const config = configs.get(id);
        if (!config) throw new Error(`[kabel] 未注册的数据表格：${id}`);
        return config;
      };
      const mode = (config: DataTableConfig) => (config.pagination === undefined ? 'client' : config.pagination);

      const request = async (id: string, url: string, query: DataTableQuery) => {
        const config = configOf(id);
        const generation = (generations.get(id) ?? 0) + 1;
        generations.set(id, generation);
        kernel.dispatch(dataTableActions.loading({ id, url }));
        try {
          const target = mode(config) === 'server' ? withQuery(url, query) : url;
          const response = await (config.fetch ? config.fetch(target, query) : fetchJson(target));
          const page = config.parse ? toPage(config.parse(response, query)) : parseResponse(response);
          if (generations.get(id) !== generation || !configs.has(id)) return; // 只取最后一次请求
          kernel.dispatch(
            dataTableActions.loaded({
              id,
              rows: page.rows,
              total: page.total,
              ...(mode(config) === 'server' ? query : { page: 1 }),
            }),
          );
          ctx.bus.emit('data-table:load', { id, total: page.total });
        } catch (error) {
          if (generations.get(id) !== generation || !configs.has(id)) return;
          kernel.dispatch(dataTableActions.failed({ id, error: messageOf(error) }));
          ctx.bus.emit('error', { error, source: `${DATA_TABLE_PLUGIN}:${id}` });
          throw error;
        }
      };

      const setData = (id: string, rows: readonly DataTableRow[]) => {
        configOf(id);
        generations.set(id, (generations.get(id) ?? 0) + 1); // 作废进行中的请求
        kernel.dispatch(dataTableActions.loading({ id, url: null }));
        kernel.dispatch(dataTableActions.loaded({ id, rows: [...rows], total: rows.length, page: 1 }));
        ctx.bus.emit('data-table:load', { id, total: rows.length });
      };

      const submitOf = (id: string): DataTableSubmit | undefined => {
        const t = tableOf(id);
        if (!t) return undefined;
        const config = configs.get(id);
        const selected = t.selected === null ? null : t.rows[t.selected] ?? null;
        return { rows: t.rows, total: config && mode(config) === 'server' ? t.total : t.rows.length, selected };
      };

      const add = (input: DataTableConfig): (() => void) => {
        const { id } = input;
        if (configs.has(id)) remove(id);
        const config = { ...input };
        configs.set(id, config);
        const sizes = config.pageSizes?.length ? config.pageSizes : DEFAULT_PAGE_SIZES;
        const initial: DataTableState = {
          rows: config.data ? [...config.data] : [],
          total: config.data?.length ?? 0,
          page: 1,
          pageSize: config.pagination === false ? Number.MAX_SAFE_INTEGER : config.pageSize ?? sizes[0]!,
          loading: false,
          error: null,
          selected: null,
          url: config.url ?? null,
        };
        kernel.dispatch(dataTableActions.init({ id, state: initial }));

        const items: Disposable[] = [];
        const panelId = dataTablePanelId(id);
        if (config.panel !== false) {
          items.push(
            kernel.extensions.get(ExtensionPoints.panels).add({
              id: panelId,
              region: config.panel?.region ?? 'left',
              slot: config.panel?.slot ?? 'bottom',
              order: config.panel?.order ?? 100,
              title: config.title ?? '数据表格',
              view: (props: { kernel: Kernel }) => <DataTable kernel={props.kernel} config={config} pageSizes={sizes} />,
              actions: config.url
                ? [{ id: `${panelId}.reload`, icon: 'reset', tooltip: '刷新', onClick: () => void service.load(id).catch(() => {}) }]
                : undefined,
            }),
          );
        }
        if (config.submit !== false) {
          items.push(
            kernel.extensions.get(ExtensionPoints.formData).add({
              id: panelId,
              title: config.title ?? '数据表格',
              order: config.panel === false ? 100 : config.panel?.order ?? 100,
              collect: () => submitOf(id),
            }),
          );
        }
        disposers.set(id, items);
        if (!config.data && config.url) void request(id, config.url, { page: 1, pageSize: initial.pageSize }).catch(() => {});
        return () => remove(id);
      };

      function remove(id: string) {
        disposers.get(id)?.forEach((d) => d.dispose());
        disposers.delete(id);
        configs.delete(id);
        generations.delete(id);
        kernel.dispatch(dataTableActions.remove(id));
      }

      const service: DataTableService = {
        list: () => [...configs.keys()],
        add,
        setData,
        load: async (id, url) => {
          const t = tableOf(id);
          const target = url ?? t?.url ?? configOf(id).url;
          if (!target) throw new Error('没有可加载的数据接口');
          await request(id, target, { page: url ? 1 : t?.page ?? 1, pageSize: t?.pageSize ?? 10 });
        },
        setPage: async (id, page, pageSize) => {
          const config = configOf(id);
          const t = tableOf(id)!;
          const size = pageSize ?? t.pageSize;
          const pages = pageCount(t.total, size);
          const next = Math.min(Math.max(1, Math.floor(page)), pages);
          if (mode(config) === 'server' && t.url) {
            await request(id, t.url, { page: pageSize && pageSize !== t.pageSize ? 1 : next, pageSize: size });
            return;
          }
          kernel.dispatch(dataTableActions.setPage({ id, page: next, pageSize: size }));
        },
        select: (id, index) => {
          const t = tableOf(id);
          if (!t) return;
          const valid = index !== null && index >= 0 && index < t.rows.length ? index : null;
          if (t.selected === valid) return;
          kernel.dispatch(dataTableActions.select({ id, index: valid }));
          ctx.bus.emit('data-table:select', { id, index: valid, row: valid === null ? null : t.rows[valid]! });
        },
        getState: tableOf,
        getSubmitData: submitOf,
      };
      ctx.provide(DATA_TABLE_SERVICE, service);

      ctx.registerCommand({
        id: 'dataTable.reload',
        title: '刷新数据表格',
        hidden: true,
        run: (_k, id: string) => service.load(id),
      });

      for (const table of options.tables ?? []) add(table);
      ctx.onDispose(() => [...configs.keys()].forEach(remove));
    },
  });
