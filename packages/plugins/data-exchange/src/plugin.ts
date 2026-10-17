import { createSlice, definePlugin, DIALOG_SERVICE, ExtensionPoints, NOTIFY_SERVICE } from '@kabel/core';
import { downloadFile } from '@kabel/ui';
import { h } from 'preact';
import { FIELDS_SERVICE, isEmptyValue, type FieldRaw } from '@kabel/plugin-fields';
import { WORKSPACE_SERVICE, type DocumentItem } from '@kabel/plugin-workspace';
import { DataExchangeConfigSchema, type DataExchangeConfig } from './config';
import {
  DATA_EXCHANGE_PLUGIN,
  DATA_EXCHANGE_SERVICE,
  LOADER_DIALOG,
  PREVIEW_DIALOG,
  type DataExchangeService,
  type ExchangeData,
  type ExchangeDocument,
  type ExchangeFormat,
  type ExchangeInput,
  type ExchangeLoadResult,
  type ExchangePayload,
} from './contract';
import { deserialize, FORMAT_EXT, FORMAT_MIME, getPath, serialize, setPath } from './format';
import { EXCHANGE_CONTROLS, ExchangeControls, LoadDialog, PreviewDialog } from './ui';

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
    busy: (s: DataExchangeState, busy: DataExchangeState['busy']) => (s.busy === busy ? s : { ...s, busy }),
  },
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 导出时不输出只在当前页面有效的地址 */
const portableUrl = (src: string) => (/^(blob|data):/i.test(src) ? undefined : src);

/**
 * 数据对接（业务插件）：把字段模型与文件列表导出为 JSON / YAML 交给业务层，或载入业务层提供的数据。
 *
 * 插件不发请求、不做持久化。工具栏控件样式一致：
 * - **加载数据**：经底座弹窗（`DIALOG_SERVICE`）按配置的格式选择文件或粘贴文本后载入字段；
 * - **查看数据**：按当前配置序列化并在底座弹窗中展示，不提交；
 * - **导出数据**：按当前配置序列化并下载文件，不校验、不提交；
 *
 * 业务层调用 `submit()`、以及保存时导出，按配置校验必填后经 `data-exchange:submit` 提交，未通过则不导出。
 * 业务层加载仍走 `request()` / `data-exchange:load`，不由工具栏按钮触发。
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
      // 弹窗由底座渲染（遮罩、拖动、关闭、焦点统一），插件只贡献内容并经 DIALOG_SERVICE 打开 / 关闭
      const dialogs = () => kernel.services.tryGet(DIALOG_SERVICE);
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
          const results = await ctx.bus.emitAsync('data-exchange:load', { format: options.format });
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

      /** 未通过时定位到第一个错误字段并中断（工具栏导出不走这里） */
      const ensureValid = () => {
        if (!options.validate) return;
        const errors = Object.keys(fields.validate());
        if (!errors.length) return;
        fields.focus(errors[0]!);
        throw new Error(`有 ${errors.length} 个字段未通过校验`);
      };

      /** 序列化并交给业务层；不校验。提示由调用方决定（保存流程中由保存插件统一提示） */
      const deliver = async (format?: ExchangeFormat): Promise<ExchangePayload> => {
        if (!kernel.bus.listenerCount('data-exchange:submit')) throw new Error('未接入导出接口');
        const payload = exportAs(format);
        await ctx.bus.emitAsync('data-exchange:submit', payload);
        ctx.bus.emit('data-exchange:submitted', payload);
        return payload;
      };

      /** 业务层调用：先校验再提交 */
      const submit = async (format?: ExchangeFormat): Promise<ExchangePayload> => {
        setBusy('submit');
        try {
          ensureValid();
          const payload = await deliver(format);
          notify('导出成功', 'success');
          return payload;
        } catch (error) {
          notify(`导出失败：${messageOf(error)}`, 'error');
          throw error;
        } finally {
          setBusy(null);
        }
      };

      /** 工具栏导出：下载文件，不校验、不交给业务层 */
      const download = () => {
        try {
          const payload = exportAs();
          downloadFile(payload.filename, payload.text, payload.mime);
          notify('导出成功', 'success');
        } catch (error) {
          notify(`导出失败：${messageOf(error)}`, 'error');
        }
      };

      /** 把对话框中的文本按配置格式载入；不向业务层请求数据 */
      const applyText = async (text: string): Promise<ExchangeLoadResult | null> => {
        if (!text.trim()) {
          notify('请输入或选择文件', 'warning');
          return null;
        }
        if (!(await confirmDiscard())) return null;
        setBusy('load');
        try {
          const result = await load(text);
          notify(`已加载 ${result.fields} 个字段${result.documents ? `、${result.documents} 个文件` : ''}`, 'success');
          dialogs()?.close(LOADER_DIALOG);
          return result;
        } catch (error) {
          notify(`加载失败：${messageOf(error)}`, 'error');
          throw error;
        } finally {
          setBusy(null);
        }
      };

      const service: DataExchangeService = { collect, export: exportAs, parse, load, request, submit };
      ctx.provide(DATA_EXCHANGE_SERVICE, service);

      // 命令失败已提示，不再向命令调用方抛出
      const quiet = <T,>(task: () => Promise<T>) => task().catch(() => undefined);
      ctx.registerCommand({
        id: 'dataExchange.load',
        title: EXCHANGE_CONTROLS.load.title,
        icon: EXCHANGE_CONTROLS.load.icon,
        mutates: true,
        enabled: () => !busy(),
        run: () => {
          dialogs()?.close(PREVIEW_DIALOG);
          dialogs()?.open(LOADER_DIALOG);
        },
      });
      ctx.registerCommand({
        id: 'dataExchange.apply',
        title: '载入文本',
        hidden: true,
        mutates: true,
        enabled: () => !busy(),
        run: (_kernel, text: unknown) => quiet(() => applyText(typeof text === 'string' ? text : '')),
      });
      ctx.registerCommand({
        id: 'dataExchange.view',
        title: EXCHANGE_CONTROLS.view.title,
        icon: EXCHANGE_CONTROLS.view.icon,
        enabled: () => !busy(),
        run: () => {
          dialogs()?.close(LOADER_DIALOG);
          dialogs()?.open(PREVIEW_DIALOG, { text: exportAs().text });
        },
      });
      ctx.registerCommand({
        id: 'dataExchange.export',
        title: EXCHANGE_CONTROLS.export.title,
        icon: EXCHANGE_CONTROLS.export.icon,
        enabled: () => !busy(),
        run: () => download(),
      });

      // 三个控件放在同一个视图里，样式不随断点或主按钮规则分叉
      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'dataExchange.controls',
        type: 'view',
        group: 'end',
        order: 0,
        view: (props) => h(ExchangeControls, { kernel: props.kernel, controls: options.controls }),
      });
      ctx.contribute(ExtensionPoints.dialogs, {
        id: LOADER_DIALOG,
        title: EXCHANGE_CONTROLS.load.title,
        width: 640,
        view: (props) => h(LoadDialog, { ...props, format: options.format }),
        // 载入过程中不允许关闭
        closable: (state) => !state.dataExchange?.busy,
      });
      ctx.contribute(ExtensionPoints.dialogs, {
        id: PREVIEW_DIALOG,
        title: EXCHANGE_CONTROLS.view.title,
        width: 640,
        view: PreviewDialog,
      });

      if (options.submitOnSave) {
        ctx.on('save', () => {
          ensureValid();
          return deliver().then(() => undefined);
        });
      }
    },
  });
