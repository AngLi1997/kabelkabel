import { createSlice, definePlugin, ExtensionPoints, NOTIFY_SERVICE, type ToolbarItem } from '@kabel/core';
import { FIELDS_SERVICE, isEmptyValue, type FieldRaw } from '@kabel/plugin-fields';
import { WORKSPACE_SERVICE, type DocumentItem } from '@kabel/plugin-workspace';
import { DataExchangeConfigSchema, type DataExchangeConfig } from './config';
import {
  DATA_EXCHANGE_PLUGIN,
  DATA_EXCHANGE_SERVICE,
  type DataExchangeService,
  type ExchangeControl,
  type ExchangeData,
  type ExchangeDocument,
  type ExchangeFormat,
  type ExchangeInput,
  type ExchangeLoadResult,
  type ExchangePayload,
} from './contract';
import { deserialize, FORMAT_EXT, FORMAT_MIME, formatOfName, getPath, serialize, setPath } from './format';

export interface DataExchangeState {
  /** 进行中的操作 */
  busy: 'load' | 'submit' | null;
}

declare module '@kabel/core' {
  interface KabelState {
    dataExchange: DataExchangeState;
  }
}

export const dataExchangeSlice = createSlice({
  name: 'dataExchange',
  initialState: { busy: null } as DataExchangeState,
  reducers: {
    busy: (s: DataExchangeState, busy: DataExchangeState['busy']) => (s.busy === busy ? s : { busy }),
  },
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 导出时不输出只在当前页面有效的地址 */
const portableUrl = (src: string) => (/^(blob|data):/i.test(src) ? undefined : src);

const CONTROLS: Record<ExchangeControl, Omit<ToolbarItem, 'id' | 'command'> & { title: string }> = {
  load: { title: '加载数据', icon: 'file', label: '加载数据' },
  import: { title: '导入文件', icon: 'folder', label: '导入' },
  export: { title: '导出文件', icon: 'download', label: '导出' },
  submit: { title: '提交数据', icon: 'submit', label: '提交', primary: true },
};

/**
 * 数据对接（业务插件）：把字段模型与文件列表导出为 JSON / YAML 交给业务层，或载入业务层提供的数据。
 *
 * 插件不发请求、不做持久化：
 * - **加载**：`data-exchange:load`（emitAsync）向业务层要数据，处理器返回对象或文本；
 * - **提交**：导出后经 `data-exchange:submit`（emitAsync）交给业务层，reject 表示失败；
 * - 控件、格式、数据项与字段对照都在插件配置中设置。
 */
export const dataExchangePlugin = (config?: Partial<DataExchangeConfig>) =>
  definePlugin({
    name: DATA_EXCHANGE_PLUGIN,
    title: '数据对接',
    inject: { required: [FIELDS_SERVICE], optional: [WORKSPACE_SERVICE] },
    Config: DataExchangeConfigSchema,
    config,
    setup(ctx, options) {
      const { kernel } = ctx;
      const fields = kernel.services.get(FIELDS_SERVICE);
      const workspace = () => kernel.services.tryGet(WORKSPACE_SERVICE);
      const notifier = () => kernel.services.tryGet(NOTIFY_SERVICE);
      const notify = (message: string, type: 'success' | 'warning' | 'error') =>
        notifier()?.notify(message, { type, duration: type === 'error' ? undefined : 2500 });
      const has = (item: DataExchangeConfig['items'][number]) => options.items.includes(item);

      ctx.registerSlice(dataExchangeSlice);
      const busy = () => kernel.getState().dataExchange.busy;
      const setBusy = (value: DataExchangeState['busy']) => kernel.dispatch(dataExchangeSlice.actions.busy(value));

      /** 参与交换的字段：对照表为空时为全部字段（路径即字段标识） */
      const mapped = (direction: 'submit' | 'load') => {
        if (!options.mapping.length) return fields.fields().map((f) => ({ field: f.key, path: f.key }));
        return options.mapping.filter((m) => m.field && m[direction]).map((m) => ({ field: m.field, path: m.path || m.field }));
      };

      const collect = (): ExchangeData => {
        const data: ExchangeData = {};
        if (has('fields')) {
          const values: Record<string, unknown> = {};
          for (const { field, path } of mapped('submit')) {
            const value: FieldRaw = fields.get(field)?.value ?? null;
            if (options.skipEmpty && isEmptyValue(value)) continue;
            setPath(values, path, value);
          }
          if (options.fieldsPath) setPath(data, options.fieldsPath, values);
          else Object.assign(data, values);
        }
        if (has('review')) {
          data.review = {};
          for (const { field } of mapped('submit')) {
            const value = fields.get(field);
            if (value) data.review[field] = { source: value.source, review: value.review, confidence: value.confidence };
          }
        }
        if (has('documents')) {
          data.documents = (workspace()?.getDocuments() ?? []).map(
            (d: DocumentItem): ExchangeDocument => ({ id: d.id, name: d.name, group: d.group, url: portableUrl(d.src), meta: d.meta }),
          );
        }
        // 去掉 undefined，JSON 与 YAML 输出一致
        return JSON.parse(JSON.stringify(data)) as ExchangeData;
      };

      const exportAs = (format: ExchangeFormat = options.format): ExchangePayload => {
        const data = collect();
        return { format, data, text: serialize(data, format), mime: FORMAT_MIME[format], filename: `${options.filename || 'archive'}.${FORMAT_EXT[format]}` };
      };

      const parse = (text: string, format: ExchangeFormat = options.format) => deserialize(text, format);

      const load = async (input: ExchangeInput, format: ExchangeFormat = options.format): Promise<ExchangeLoadResult> => {
        const data = typeof input === 'string' ? parse(input, format) : input;
        if (!data || typeof data !== 'object') throw new Error('数据格式不正确：根节点应为对象');
        const result: ExchangeLoadResult = { fields: 0, documents: 0 };

        const docs = Array.isArray(data.documents) ? data.documents.filter((d) => d && (d.url || (d as { src?: string }).src)) : [];
        const ws = workspace();
        if (has('documents') && docs.length && ws) {
          await ws.setImages(docs.map((d) => ({ id: d.id, name: d.name, group: d.group, url: d.url ?? (d as { src?: string }).src })));
          result.documents = docs.length;
        }

        if (has('fields')) {
          const root = options.fieldsPath ? getPath(data, options.fieldsPath) : data;
          const values: Record<string, unknown> = {};
          if (root && typeof root === 'object') {
            for (const { field, path } of mapped('load')) {
              if (!fields.field(field)) continue;
              const value = getPath(root, path);
              if (value !== undefined) values[field] = value;
            }
          }
          fields.load(values);
          result.fields = Object.keys(values).length;
        }
        ctx.bus.emit('data-exchange:loaded', result);
        return result;
      };

      /** 有未保存修改时确认是否覆盖 */
      const confirmDiscard = async () => {
        if (!options.confirmLoad || !kernel.getState().history.dirty) return true;
        return (await notifier()?.confirm({ message: '当前有未保存的修改，加载后将被覆盖，是否继续？', okText: '继续加载', danger: true })) ?? true;
      };

      const request = async (): Promise<ExchangeLoadResult | null> => {
        if (!kernel.bus.listenerCount('data-exchange:load')) {
          notify('未接入数据来源', 'warning');
          return null;
        }
        if (!(await confirmDiscard())) return null;
        setBusy('load');
        try {
          const results = await kernel.bus.emitAsync('data-exchange:load', { format: options.format });
          const input = results.find((r) => r != null && r !== '') as ExchangeInput | undefined;
          if (input === undefined) {
            notify('没有可加载的数据', 'warning');
            return null;
          }
          const result = await load(input);
          notify(`已加载 ${result.fields} 个字段${result.documents ? `、${result.documents} 个文件` : ''}`, 'success');
          return result;
        } catch (error) {
          notify(`加载失败：${messageOf(error)}`, 'error');
          throw error;
        } finally {
          setBusy(null);
        }
      };

      /** 校验并交给业务层；提示由调用方决定（保存流程中由保存插件统一提示） */
      const deliver = async (format?: ExchangeFormat): Promise<ExchangePayload> => {
        if (!kernel.bus.listenerCount('data-exchange:submit')) throw new Error('未接入提交接口');
        if (options.validate) {
          const errors = Object.keys(fields.validate());
          if (errors.length) {
            fields.focus(errors[0]!);
            throw new Error(`有 ${errors.length} 个字段未通过校验`);
          }
        }
        const payload = exportAs(format);
        await kernel.bus.emitAsync('data-exchange:submit', payload);
        ctx.bus.emit('data-exchange:submitted', payload);
        return payload;
      };

      const submit = async (format?: ExchangeFormat): Promise<ExchangePayload> => {
        setBusy('submit');
        try {
          const payload = await deliver(format);
          notify('提交成功', 'success');
          return payload;
        } catch (error) {
          notify(`提交失败：${messageOf(error)}`, 'error');
          throw error;
        } finally {
          setBusy(null);
        }
      };

      const download = (format?: ExchangeFormat): ExchangePayload => {
        const payload = exportAs(format);
        if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const url = URL.createObjectURL(new Blob([payload.text], { type: payload.mime }));
          const a = document.createElement('a');
          a.href = url;
          a.download = payload.filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
        return payload;
      };

      /** 选择本地 JSON / YAML 文件并载入；必须在用户手势中调用 */
      const importFile = () =>
        new Promise<ExchangeLoadResult | null>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,.yaml,.yml,application/json,application/yaml';
          input.style.display = 'none';
          const done = () => input.remove();
          input.addEventListener('cancel', () => {
            done();
            resolve(null);
          });
          input.addEventListener('change', async () => {
            const file = input.files?.[0];
            done();
            if (!file) return resolve(null);
            try {
              if (!(await confirmDiscard())) return resolve(null);
              const result = await load(await file.text(), formatOfName(file.name) ?? options.format);
              notify(`已导入 ${result.fields} 个字段${result.documents ? `、${result.documents} 个文件` : ''}`, 'success');
              resolve(result);
            } catch (error) {
              notify(`导入失败：${messageOf(error)}`, 'error');
              reject(error);
            }
          });
          document.body.appendChild(input);
          input.click();
        });

      const service: DataExchangeService = { collect, export: exportAs, parse, load, request, submit, download };
      ctx.provide(DATA_EXCHANGE_SERVICE, service);

      // 命令失败已提示，不再向命令调用方抛出
      const quiet = <T,>(task: () => Promise<T>) => task().catch(() => undefined);
      ctx.registerCommand({
        id: 'dataExchange.load',
        title: CONTROLS.load.title,
        icon: CONTROLS.load.icon,
        mutates: true,
        enabled: () => !busy(),
        run: () => quiet(request),
      });
      ctx.registerCommand({
        id: 'dataExchange.submit',
        title: CONTROLS.submit.title,
        icon: CONTROLS.submit.icon,
        enabled: () => !busy(),
        run: () => quiet(() => submit()),
      });
      ctx.registerCommand({
        id: 'dataExchange.export',
        title: CONTROLS.export.title,
        icon: CONTROLS.export.icon,
        run: () => void download(),
      });
      ctx.registerCommand({
        id: 'dataExchange.import',
        title: CONTROLS.import.title,
        icon: CONTROLS.import.icon,
        mutates: true,
        enabled: () => !busy(),
        run: () => quiet(importFile),
      });

      // 按配置显示控件（顺序取配置中的顺序）
      options.controls.forEach((control, i) => {
        const { title, ...item } = CONTROLS[control];
        ctx.contribute(ExtensionPoints.toolbar, {
          ...item,
          id: `dataExchange.${control}`,
          command: `dataExchange.${control}`,
          group: 'end',
          order: i,
          showLabel: true,
          tooltip: title,
        });
      });

      if (options.submitOnSave) ctx.on('save', () => deliver().then(() => undefined));
    },
  });
