import { definePlugin, ExtensionPoints, shallowEqual, type Kernel, type PanelContribution } from '@kabel/core';
import { builtinFieldTypes, FieldTypes } from './field-types';
import { fieldDomId, MetadataForm } from './MetadataForm';
import { normalizeRecord, normalizeSchema } from './schema';
import { METADATA_SERVICE, type MetadataService } from './service';
import { createMetadataState, metadataActions, metadataSlice, recordActions, recordSlice } from './slices';
import type { RecordInput, SchemaInput, ValidationResult } from './types';
import { requiredProgress, validateAll, type TypeValidator } from './validate';

export interface MetadataPluginOptions {
  schema?: SchemaInput;
  record?: RecordInput;
  readonly?: boolean;
  /** 存在校验错误时是否仍允许保存，默认 false */
  allowInvalidSave?: boolean;
  /** 覆盖著录面板的标题、所在区域、排序 */
  panel?: Partial<Pick<PanelContribution, 'title' | 'region' | 'order'>>;
}

export const METADATA_PLUGIN = 'kabel:metadata';

export const metadataPlugin = (options: MetadataPluginOptions = {}) =>
  definePlugin({
    name: METADATA_PLUGIN,
    setup(ctx) {
      const { kernel } = ctx;
      const schema = normalizeSchema(options.schema);
      const record = normalizeRecord(options.record, schema);
      ctx.registerSlice(metadataSlice, createMetadataState(schema, !!options.readonly));
      ctx.registerSlice(recordSlice, record);
      ctx.contribute(FieldTypes, ...builtinFieldTypes);

      const state = () => kernel.getState();
      const typeValidators = (): Record<string, TypeValidator | undefined> =>
        Object.fromEntries(kernel.extensions.get(FieldTypes).getAll().map((t) => [t.id, t.validate]));

      /** 按“已交互字段 / 已整体校验”规则计算当前应展示的错误 */
      const revalidate = () => {
        const { metadata, record: rec } = state();
        const all = validateAll(metadata.schema, rec.values, typeValidators());
        const visible =
          metadata.validatedAt !== null
            ? all
            : Object.fromEntries(Object.entries(all).filter(([key]) => metadata.touched[key]));
        kernel.dispatch(metadataActions.setErrors(visible));
        return all;
      };

      ctx.watch((s) => s.record?.values, (values) => {
        if (!values) return;
        revalidate();
        kernel.bus.emit('record:change', { record: { id: state().record.id, values } });
      });
      ctx.watch(
        (s) => (s.metadata ? [s.metadata.touched, s.metadata.validatedAt, s.metadata.schema] : null),
        revalidate,
        { equals: (a, b) => shallowEqual(a, b) },
      );

      const validate = (): ValidationResult => {
        kernel.dispatch(metadataActions.markValidated(Date.now()));
        const errors = revalidate();
        const result = { valid: Object.keys(errors).length === 0, errors };
        kernel.bus.emit('validate', result);
        return result;
      };

      const focusField = (key: string) => {
        const { metadata } = state();
        const field = metadata.schema.fields[key];
        if (!field) return;
        if (kernel.commands.has('layout.reveal')) void kernel.execute('layout.reveal', 'main');
        kernel.dispatch(metadataActions.setGroupCollapsed({ key: field.group, collapsed: false }));
        // 等待分组展开后的渲染
        setTimeout(() => {
          const el = globalThis.document?.getElementById(fieldDomId(kernel.id, key));
          if (!el) return;
          const target = el.matches('input,select,textarea') ? el : el.querySelector<HTMLElement>('input,select,textarea') ?? el;
          target.focus({ preventScroll: true });
          el.closest('.kb-md__field')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          const row = el.closest('.kb-md__field');
          row?.classList.add('is-flash');
          setTimeout(() => row?.classList.remove('is-flash'), 1200);
        }, 0);
      };

      const service: MetadataService = {
        getSchema: () => state().metadata.schema,
        setSchema: (input) => {
          const next = normalizeSchema(input);
          kernel.dispatch(metadataActions.setSchema(next));
          const values = normalizeRecord({ values: state().record.values }, next).values;
          kernel.dispatch(recordActions.setValues(values, { history: false }));
        },
        getRecord: () => {
          const { id, values } = state().record;
          return id === undefined ? { values } : { id, values };
        },
        setRecord: (input) => {
          const next = normalizeRecord(input, state().metadata.schema);
          kernel.dispatch(recordActions.load(next, { history: false }));
          kernel.dispatch(metadataActions.resetValidation());
          kernel.history.clear();
        },
        getValue: (key) => state().record.values[key],
        setValue: (key, value, label) =>
          kernel.dispatch(recordActions.setField({ key, value }, { history: { label: label ?? `修改「${key}」` } })),
        setValues: (values, label = '批量修改') =>
          kernel.dispatch(recordActions.setValues(values, { history: { label } })),
        setReadonly: (readonly) => kernel.dispatch(metadataActions.setReadonly(readonly)),
        validate,
        focusField,
      };
      ctx.provide(METADATA_SERVICE, service);

      const save = async (k: Kernel) => {
        const result = validate();
        if (!result.valid && !options.allowInvalidSave) {
          focusField(Object.keys(result.errors)[0]!);
          return { ok: false as const, errors: result.errors };
        }
        const payload = { record: service.getRecord(), values: state().record.values };
        k.dispatch(metadataActions.saveStart());
        try {
          await k.bus.emitAsync('save', payload);
          k.history.markSaved();
          k.dispatch(metadataActions.saveSuccess(Date.now()));
          k.bus.emit('saved', payload);
          return { ok: true as const };
        } catch (error) {
          k.dispatch(metadataActions.saveFailure(error instanceof Error ? error.message : String(error)));
          k.bus.emit('save:error', { error });
          return { ok: false as const, error };
        }
      };

      ctx.registerCommand({
        id: 'kabel.save',
        title: '保存',
        icon: 'save',
        keybinding: 'Mod+S',
        enabled: (k) => !k.getState().metadata.readonly && !k.getState().metadata.saving,
        run: save,
      });
      ctx.registerCommand({ id: 'metadata.validate', title: '校验', icon: 'validate', run: () => validate() });
      ctx.registerCommand({ id: 'metadata.focusField', title: '定位字段', run: (_k, key: string) => focusField(key) });
      ctx.registerCommand({
        id: 'metadata.toggleAllGroups',
        title: '展开/收起全部分组',
        run: (k) => {
          const { collapsed } = k.getState().metadata;
          const anyExpanded = Object.values(collapsed).some((c) => !c);
          k.dispatch(metadataActions.setAllCollapsed(anyExpanded));
        },
      });

      ctx.contribute(
        ExtensionPoints.toolbar,
        { id: 'metadata.save', icon: 'save', label: '保存', primary: true, command: 'kabel.save', order: 10 },
        { id: 'metadata.separator', type: 'separator', order: 29 },
        { id: 'metadata.validate', icon: 'validate', label: '校验', command: 'metadata.validate', order: 30 },
      );

      ctx.contribute(ExtensionPoints.panels, {
        id: 'metadata.form',
        region: options.panel?.region ?? 'main',
        title: options.panel?.title ?? '著录信息',
        order: options.panel?.order ?? 10,
        view: MetadataForm,
        actions: [
          {
            id: 'metadata.toggleAllGroups',
            icon: 'fold',
            tooltip: '展开/收起全部分组',
            command: 'metadata.toggleAllGroups',
          },
        ],
      });

      const time = (t: number) => new Date(t).toTimeString().slice(0, 5);
      ctx.contribute(
        ExtensionPoints.statusbar,
        {
          id: 'metadata.state',
          order: 10,
          text: (s) => {
            if (!s.metadata) return null;
            if (s.metadata.saving) return '保存中…';
            if (s.metadata.saveError) return `保存失败：${s.metadata.saveError}`;
            if (s.history.dirty) return '已修改';
            return s.metadata.savedAt ? `已保存 ${time(s.metadata.savedAt)}` : '未修改';
          },
          tone: (s) => (s.metadata?.saveError ? 'danger' : s.history.dirty ? 'warning' : 'default'),
        },
        {
          id: 'metadata.required',
          order: 20,
          text: (s) => {
            if (!s.metadata) return null;
            const { filled, total } = requiredProgress(s.metadata.schema, s.record.values);
            return total ? `必填 ${filled}/${total}` : null;
          },
        },
        {
          id: 'metadata.errors',
          order: 30,
          icon: 'warning',
          text: (s) => {
            const n = s.metadata ? Object.keys(s.metadata.errors).length : 0;
            return n ? `${n} 项待修正` : null;
          },
          tone: () => 'danger',
          tooltip: '定位到第一个错误',
          command: 'metadata.focusFirstError',
        },
      );
      ctx.registerCommand({
        id: 'metadata.focusFirstError',
        run: (k) => {
          const errors = k.getState().metadata.errors;
          const order = Object.keys(k.getState().metadata.schema.fields);
          const first = order.find((key) => errors[key]);
          if (first) focusField(first);
        },
      });
    },
  });
