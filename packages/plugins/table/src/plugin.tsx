import { definePlugin, ExtensionPoints, isReadonly, NOTIFY_SERVICE, Schema, type Disposable, type Kernel } from '@kabel/core';
import {
  TABLE_PLUGIN,
  TABLE_SERVICE,
  type TableCellRef,
  type TableConfig,
  type TablePatch,
  type TablePluginConfig,
  type TableQuery,
  type TableRow,
  type TableService,
  type TableState,
  type TableSubmit,
  type TableSubmitPayload,
  type TableSubmitResult,
} from './contract';
import { ChangeTracker, remapIndexes, setField, validateRows } from './edit';
import { tableActions, tableSlice } from './slice';
import { fetchJson, getField, parseResponse, pageCount, toPage, withQuery } from './source';
import { TableView } from './TableView';

export interface TablePluginOptions extends Partial<TablePluginConfig> {
  /** 初始注册的表格；也可运行期通过 `TABLE_SERVICE.add` 增加 */
  tables?: TableConfig[];
}

/** 插件配置（设置 › 插件管理 › 表格 › 配置）：各表格未显式设置 `editable` / `multiple` 时的默认值 */
export const TablePluginConfigSchema: Schema<Partial<TablePluginConfig>, TablePluginConfig> = Schema.object({
  editable: Schema.boolean().default(false).description('可编辑（新增行、删除行、行内修改、提交）'),
  multiple: Schema.boolean().default(false).description('可多选行'),
}) as never;

const DEFAULT_PAGE_SIZES = [10, 20, 50];
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 表单数据与面板的 id */
export const tablePanelId = (id: string) => `table.${id}`;

/** 插件重载（如在插件管理中保存配置）前的表格，按内核保存；同一个插件对象重新 setup 时恢复，编辑中的数据不丢失 */
interface Snapshot {
  options: TablePluginOptions;
  configs: Map<string, TableConfig>;
  states: Record<string, TableState>;
  trackers: Map<string, ChangeTracker>;
}
const snapshots = new WeakMap<Kernel, Snapshot>();

/**
 * 表格（能力插件）：业务端传入 JSON 数据或接口 URL，在工作台面板中以表格展示，支持前端/后端分页与行选中。
 *
 * - **数据源**：`data`（数组）或 `url`（GET JSON，兼容常见分页返回结构）；运行期用服务 `setData` / `load` 切换；
 * - **可编辑**（`editable`）：新增行、删除行、行内修改、必填校验、提交（`onSubmit` / `table:submit` 可否决）、放弃修改；
 * - **可多选**（`multiple`）：复选框列，勾选变化派发 `table:check`；
 * - **配置**：`Config` 为全部表格的默认值（插件管理中可改），表格配置中显式设置的优先；
 * - **提交**：每个表格以 `table.<id>` 贡献到 `ExtensionPoints.formData`；
 * - **对接**：不依赖任何插件，可选注入消息服务用于提示。
 */
export const tablePlugin = (options: TablePluginOptions = {}) =>
  definePlugin({
    name: TABLE_PLUGIN,
    title: '表格',
    inject: { optional: [NOTIFY_SERVICE] },
    Config: TablePluginConfigSchema,
    config: Object.fromEntries((['editable', 'multiple'] as const).filter((k) => options[k] !== undefined).map((k) => [k, options[k]])),
    setup(ctx, pluginConfig: TablePluginConfig) {
      const { kernel } = ctx;
      ctx.registerSlice(tableSlice);
      const configs = new Map<string, TableConfig>();
      const trackers = new Map<string, ChangeTracker>();
      const disposers = new Map<string, Disposable[]>();
      const generations = new Map<string, number>();
      const notify = kernel.services.tryGet(NOTIFY_SERVICE);
      const tableOf = (id: string) => kernel.getState().table?.[id];
      const configOf = (id: string) => {
        const config = configs.get(id);
        if (!config) throw new Error(`[kabel] 未注册的表格：${id}`);
        return config;
      };
      const stateOf = (id: string) => {
        configOf(id);
        return tableOf(id)!;
      };
      const trackerOf = (id: string) => trackers.get(id)!;
      const mode = (config: TableConfig) => (config.pagination === undefined ? 'client' : config.pagination);
      const editableOf = (config: TableConfig) => config.editable ?? pluginConfig.editable;
      const multipleOf = (config: TableConfig) => config.multiple ?? pluginConfig.multiple;
      const patchState = (id: string, next: Partial<TableState>) => kernel.dispatch(tableActions.patch({ id, next }));

      // ---------- 数据源 ----------

      const request = async (id: string, url: string, query: TableQuery) => {
        const config = configOf(id);
        const generation = (generations.get(id) ?? 0) + 1;
        generations.set(id, generation);
        kernel.dispatch(tableActions.loading({ id, url }));
        try {
          const target = mode(config) === 'server' ? withQuery(url, query) : url;
          const response = await (config.fetch ? config.fetch(target, query) : fetchJson(target));
          const page = config.parse ? toPage(config.parse(response, query)) : parseResponse(response);
          if (generations.get(id) !== generation || !configs.has(id)) return; // 只取最后一次请求
          trackerOf(id).reset(page.rows);
          kernel.dispatch(
            tableActions.loaded({
              id,
              rows: page.rows,
              total: page.total,
              ...(mode(config) === 'server' ? query : { page: 1 }),
            }),
          );
          ctx.bus.emit('table:load', { id, total: page.total });
        } catch (error) {
          if (generations.get(id) !== generation || !configs.has(id)) return;
          kernel.dispatch(tableActions.failed({ id, error: messageOf(error) }));
          ctx.bus.emit('error', { error, source: `${TABLE_PLUGIN}:${id}` });
          throw error;
        }
      };

      const setData = (id: string, input: readonly TableRow[]) => {
        configOf(id);
        const rows = [...input];
        generations.set(id, (generations.get(id) ?? 0) + 1); // 作废进行中的请求
        trackerOf(id).reset(rows);
        kernel.dispatch(tableActions.loading({ id, url: null }));
        kernel.dispatch(tableActions.loaded({ id, rows, total: rows.length, page: 1 }));
        ctx.bus.emit('table:load', { id, total: rows.length });
      };

      const submitOf = (id: string): TableSubmit | undefined => {
        const t = tableOf(id);
        const config = configs.get(id);
        if (!t || !config) return undefined;
        const selected = t.selected === null ? null : t.rows[t.selected] ?? null;
        return {
          rows: t.rows,
          total: mode(config) === 'server' ? t.total : t.rows.length,
          selected,
          ...(multipleOf(config) ? { checked: t.checked.map((i) => t.rows[i]!).filter(Boolean) } : {}),
          ...(editableOf(config) ? { dirty: t.dirty, changes: trackerOf(id).changes(t.rows) } : {}),
        };
      };

      // ---------- 注册 ----------

      const sizesOf = (config: TableConfig) => (config.pageSizes?.length ? config.pageSizes : DEFAULT_PAGE_SIZES);
      const pageSizeOf = (config: TableConfig) =>
        config.pagination === false ? Number.MAX_SAFE_INTEGER : config.pageSize ?? sizesOf(config)[0]!;

      /** 按当前配置（重新）贡献面板与表单数据；配置变化时先释放旧的贡献 */
      const contribute = (id: string) => {
        disposers.get(id)?.forEach((d) => d.dispose());
        const config = configOf(id);
        const sizes = sizesOf(config);
        const items: Disposable[] = [];
        const panelId = tablePanelId(id);
        if (config.panel !== false) {
          items.push(
            kernel.extensions.get(ExtensionPoints.panels).add({
              id: panelId,
              region: config.panel?.region ?? 'left',
              slot: config.panel?.slot ?? 'bottom',
              order: config.panel?.order ?? 100,
              title: config.title ?? '表格',
              view: (props: { kernel: Kernel }) => (
                <TableView kernel={props.kernel} config={config} pageSizes={sizes} tracker={() => trackers.get(id)} />
              ),
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
              title: config.title ?? '表格',
              order: config.panel === false ? 100 : config.panel?.order ?? 100,
              collect: () => submitOf(id),
            }),
          );
        }
        disposers.set(id, items);
      };

      const add = (input: TableConfig, restore?: { state?: TableState; tracker?: ChangeTracker }): (() => void) => {
        const { id } = input;
        if (configs.has(id)) remove(id);
        const config = { ...input };
        configs.set(id, config);
        const tracker = restore?.tracker ?? new ChangeTracker();
        trackers.set(id, tracker);
        const fresh: TableState = {
          rows: config.data ? [...config.data] : [],
          total: config.data?.length ?? 0,
          page: 1,
          pageSize: pageSizeOf(config),
          loading: false,
          error: null,
          selected: null,
          url: config.url ?? null,
          checked: [],
          editing: null,
          dirty: false,
          submitting: false,
          invalid: [],
        };
        const initial = restore?.state ? { ...fresh, ...restore.state, loading: false, submitting: false } : fresh;
        if (!restore?.tracker) tracker.reset(initial.rows);
        kernel.dispatch(tableActions.init({ id, state: initial }));
        contribute(id);
        ctx.bus.emit('table:add', { id });
        if (!restore?.state && !config.data && config.url) void request(id, config.url, { page: 1, pageSize: initial.pageSize }).catch(() => {});
        return () => remove(id);
      };

      /**
       * 运行期修改配置（与当前配置浅合并，`id` 不可改）：标题、列、分页、序号列、提交、可编辑、可多选与面板默认位置立即生效；
       * 传入 `data` 切换为本地数据，传入 `url` 重新请求；分页方式或每页条数变化时回到第 1 页。
       */
      const update = async (id: string, patch: TablePatch): Promise<void> => {
        const prev = configOf(id);
        const { id: _ignored, ...rest } = patch as TablePatch & { id?: string };
        const next: TableConfig = { ...prev, ...rest };
        configs.set(id, next);
        contribute(id);
        if (!multipleOf(next) && tableOf(id)?.checked.length) patchState(id, { checked: [] });
        if (!editableOf(next) && tableOf(id)?.editing) patchState(id, { editing: null, invalid: [] });
        ctx.bus.emit('table:config', { id, config: next, changed: Object.keys(rest) });
        if (rest.data) return setData(id, rest.data);
        const sizeChanged = mode(next) !== mode(prev) || pageSizeOf(next) !== pageSizeOf(prev);
        if (rest.url !== undefined && rest.url !== tableOf(id)?.url) {
          if (rest.url) await request(id, rest.url, { page: 1, pageSize: pageSizeOf(next) });
          return;
        }
        if (sizeChanged) {
          const t = tableOf(id);
          if (mode(next) === 'server' && t?.url) await request(id, t.url, { page: 1, pageSize: pageSizeOf(next) });
          else kernel.dispatch(tableActions.setPage({ id, page: 1, pageSize: pageSizeOf(next) }));
        }
      };

      function remove(id: string) {
        if (!configs.has(id)) return;
        disposers.get(id)?.forEach((d) => d.dispose());
        disposers.delete(id);
        configs.delete(id);
        trackers.delete(id);
        generations.delete(id);
        kernel.dispatch(tableActions.remove(id));
        ctx.bus.emit('table:remove', { id });
      }

      // ---------- 选中与多选 ----------

      const select = (id: string, index: number | null) => {
        const t = tableOf(id);
        if (!t) return;
        const valid = index !== null && index >= 0 && index < t.rows.length ? index : null;
        if (t.selected === valid) return;
        kernel.dispatch(tableActions.select({ id, index: valid }));
        ctx.bus.emit('table:select', { id, index: valid, row: valid === null ? null : t.rows[valid]! });
      };

      const assertMultiple = (id: string) => {
        if (!multipleOf(configOf(id))) throw new Error(`[kabel] 表格未开启多选：${id}`);
      };
      const setChecked = (id: string, indexes: readonly number[]) => {
        const t = stateOf(id);
        const next = [...new Set(indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < t.rows.length))].sort((a, b) => a - b);
        if (sameList(next, t.checked)) return;
        patchState(id, { checked: next });
        ctx.bus.emit('table:check', { id, indexes: next, rows: next.map((i) => t.rows[i]!) });
      };

      // ---------- 编辑 ----------

      const isEditable = (id: string) => !!configs.get(id) && editableOf(configs.get(id)!) && !isReadonly(kernel.getState());
      const assertEditable = (id: string) => {
        if (!isEditable(id)) {
          throw new Error(isReadonly(kernel.getState()) ? '[kabel] 只读模式下不能编辑表格' : `[kabel] 表格未开启编辑：${id}`);
        }
      };
      /** 写入新的行数据，并据修改追踪计算 dirty；后端分页时总数按增减调整 */
      const commitRows = (id: string, rows: TableRow[], extra: Partial<TableState> = {}) => {
        const t = stateOf(id);
        const total = mode(configOf(id)) === 'server' ? Math.max(0, t.total + rows.length - t.rows.length) : rows.length;
        patchState(id, { rows, total, dirty: trackerOf(id).isDirty(rows), ...extra });
      };

      const addRow = (id: string, row?: TableRow, index?: number): number => {
        assertEditable(id);
        const config = configOf(id);
        const t = stateOf(id);
        let next = config.columns.reduce<TableRow>((r, c) => (c.defaultValue !== undefined ? setField(r, c.key, c.defaultValue) : r), {});
        next = { ...next, ...config.createRow?.(t), ...row };
        const at = Math.min(Math.max(0, index ?? t.rows.length), t.rows.length);
        const rows = [...t.rows.slice(0, at), next, ...t.rows.slice(at)];
        trackerOf(id).markAdded(next);
        const first = config.columns.find((c) => c.editable !== false);
        const checked = t.checked.map((i) => (i >= at ? i + 1 : i));
        commitRows(id, rows, {
          selected: at,
          checked,
          editing: first ? { index: at, key: first.key } : null,
          ...(mode(config) === 'client' ? { page: Math.floor(at / t.pageSize) + 1 } : {}),
        });
        ctx.bus.emit('table:row-add', { id, index: at, row: next });
        ctx.bus.emit('table:select', { id, index: at, row: next });
        return at;
      };

      const removeRows = (id: string, indexes?: number[]): number => {
        assertEditable(id);
        const t = stateOf(id);
        const fallback = t.checked.length ? t.checked : t.selected !== null ? [t.selected] : [];
        const targets = [...new Set(indexes ?? fallback)].filter((i) => i >= 0 && i < t.rows.length).sort((a, b) => a - b);
        if (!targets.length) return 0;
        const drop = new Set(targets);
        const rows = t.rows.filter((_, i) => !drop.has(i));
        const selected = t.selected === null ? null : remapIndexes([t.selected], t.rows, rows)[0] ?? null;
        const checked = remapIndexes(t.checked, t.rows, rows);
        commitRows(id, rows, { selected, checked, editing: null, invalid: [] });
        ctx.bus.emit('table:row-remove', { id, indexes: targets, rows: targets.map((i) => t.rows[i]!) });
        if (!sameList(checked, t.checked)) ctx.bus.emit('table:check', { id, indexes: checked, rows: checked.map((i) => rows[i]!) });
        if (selected !== t.selected) ctx.bus.emit('table:select', { id, index: selected, row: selected === null ? null : rows[selected]! });
        return targets.length;
      };

      const updateCell = (id: string, index: number, key: string, value: unknown) => {
        assertEditable(id);
        const t = stateOf(id);
        const row = t.rows[index];
        if (!row) throw new Error(`[kabel] 表格 ${id} 没有第 ${index} 行`);
        const oldValue = getField(row, key);
        if (Object.is(oldValue, value)) return;
        const next = setField(row, key, value);
        trackerOf(id).derive(next, row);
        const rows = t.rows.map((r, i) => (i === index ? next : r));
        commitRows(id, rows, { invalid: t.invalid.filter((c) => c.index !== index || c.key !== key) });
        ctx.bus.emit('table:cell-change', { id, index, key, value, oldValue, row: next });
      };

      const validate = (id: string) => validateRows(stateOf(id).rows, configOf(id).columns);

      const submit = async (id: string): Promise<TableSubmitResult> => {
        const config = configOf(id);
        const title = config.title ?? '表格';
        if (!isEditable(id)) return { ok: false, error: new Error(`表格不可编辑：${id}`) };
        if (stateOf(id).submitting) return { ok: false, error: new Error('正在提交') };
        const invalid = validate(id);
        if (invalid.length) {
          patchState(id, { invalid, editing: null });
          const error = new Error(`${title}：有 ${invalid.length} 个必填项未填写`);
          ctx.bus.emit('table:submit-error', { id, error, invalid });
          notify?.notify(error.message, { type: 'warning' });
          return { ok: false, invalid, error };
        }
        const t = stateOf(id);
        const payload: TableSubmitPayload = { id, rows: t.rows, changes: trackerOf(id).changes(t.rows) };
        patchState(id, { submitting: true, editing: null, invalid: [] });
        try {
          await config.onSubmit?.(payload);
          await ctx.bus.emitAsync('table:submit', payload);
        } catch (error) {
          if (configs.has(id)) patchState(id, { submitting: false });
          ctx.bus.emit('table:submit-error', { id, error });
          notify?.notify(`${title}提交失败：${messageOf(error)}`, { type: 'error' });
          return { ok: false, error };
        }
        if (!configs.has(id)) return { ok: true };
        trackerOf(id).reset(stateOf(id).rows);
        patchState(id, { submitting: false, dirty: false });
        ctx.bus.emit('table:submitted', payload);
        notify?.notify(`${title}已提交`, { type: 'success' });
        return { ok: true };
      };

      const revert = (id: string) => {
        assertEditable(id);
        const t = stateOf(id);
        const tracker = trackerOf(id);
        const rows = tracker.baseline;
        tracker.reset(rows);
        commitRows(id, rows, { selected: null, checked: [], editing: null, invalid: [] });
        ctx.bus.emit('table:revert', { id });
        if (t.checked.length) ctx.bus.emit('table:check', { id, indexes: [], rows: [] });
        if (t.selected !== null) ctx.bus.emit('table:select', { id, index: null, row: null });
      };

      const service: TableService = {
        list: () => [...configs.keys()],
        add: (config) => add(config),
        update,
        remove: (id) => remove(id),
        getConfig: (id) => configs.get(id),
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
          kernel.dispatch(tableActions.setPage({ id, page: next, pageSize: size }));
        },
        select,
        getState: tableOf,
        getSubmitData: submitOf,

        isEditable,
        addRow,
        removeRows,
        updateCell,
        updateRow: (id, index, patch) => {
          for (const [key, value] of Object.entries(patch)) updateCell(id, index, key, value);
        },
        edit: (id, cell: TableCellRef | null) => {
          const t = stateOf(id);
          if (cell) {
            const column = configOf(id).columns.find((c) => c.key === cell.key);
            if (!isEditable(id) || t.submitting || !column || column.editable === false || !t.rows[cell.index]) return;
          }
          if (t.editing?.index === cell?.index && t.editing?.key === cell?.key) return;
          patchState(id, { editing: cell });
        },
        getChanges: (id) => trackerOf(id).changes(stateOf(id).rows),
        validate,
        submit,
        revert,

        isMultiple: (id) => !!configs.get(id) && multipleOf(configs.get(id)!),
        check: (id, indexes) => {
          assertMultiple(id);
          setChecked(id, indexes);
        },
        toggleCheck: (id, index) => {
          assertMultiple(id);
          const t = stateOf(id);
          setChecked(id, t.checked.includes(index) ? t.checked.filter((i) => i !== index) : [...t.checked, index]);
        },
        checkAll: (id, checked, indexes) => {
          assertMultiple(id);
          const t = stateOf(id);
          const targets = indexes ?? t.rows.map((_, i) => i);
          const set = new Set(t.checked);
          for (const i of targets) checked ? set.add(i) : set.delete(i);
          setChecked(id, [...set]);
        },
        getChecked: (id) => {
          const t = stateOf(id);
          return t.checked.map((i) => t.rows[i]!).filter(Boolean);
        },
      };
      ctx.provide(TABLE_SERVICE, service);

      // 整个表单保存成功后，可编辑表格的修改即视为已提交
      ctx.bus.on('saved', () => {
        for (const [id, config] of configs) {
          const t = tableOf(id);
          if (!editableOf(config) || !t?.dirty) continue;
          trackerOf(id).reset(t.rows);
          patchState(id, { dirty: false });
        }
      });

      // ---------- 命令（需要参数，均 hidden） ----------

      const command = (id: string, title: string, run: (...args: any[]) => unknown, mutates = false) =>
        ctx.registerCommand({ id, title, hidden: true, mutates, run: (_k, ...args: any[]) => run(...args) });
      command('table.reload', '刷新表格', (id: string) => service.load(id));
      command('table.update', '修改表格配置', (id: string, patch: TablePatch) => service.update(id, patch));
      command('table.setData', '设置表格数据', (id: string, rows: TableRow[]) => service.setData(id, rows));
      command('table.select', '选中表格行', (id: string, index: number | null) => service.select(id, index));
      command('table.addRow', '新增行', (id: string, row?: TableRow, index?: number) => service.addRow(id, row, index), true);
      command('table.removeRows', '删除行', (id: string, indexes?: number[]) => service.removeRows(id, indexes), true);
      command('table.submit', '提交表格', (id: string) => service.submit(id), true);
      command('table.revert', '放弃表格修改', (id: string) => service.revert(id), true);
      command('table.check', '勾选表格行', (id: string, indexes: number[]) => service.check(id, indexes));

      // 表单配置：各表格当前生效的配置（函数在展示时显示为 ƒ）
      ctx.contribute(ExtensionPoints.formConfig, {
        id: 'table',
        title: '表格',
        order: 50,
        collect: () =>
          Object.fromEntries(
            [...configs].map(([id, { data, ...config }]) => [
              id,
              { ...config, editable: editableOf(config), multiple: multipleOf(config), ...(data ? { data: `[${data.length} 行]` } : {}) },
            ]),
          ),
      });

      // 重载（如保存插件配置）时恢复同一插件对象的表格、数据与修改追踪
      const previous = snapshots.get(kernel);
      snapshots.delete(kernel);
      if (previous?.options === options) {
        for (const [id, config] of previous.configs) add(config, { state: previous.states[id], tracker: previous.trackers.get(id) });
      } else {
        for (const table of options.tables ?? []) add(table);
      }
      ctx.onDispose(() => {
        snapshots.set(kernel, { options, configs: new Map(configs), states: { ...kernel.getState().table }, trackers: new Map(trackers) });
        [...configs.keys()].forEach(remove);
      });
    },
  });
