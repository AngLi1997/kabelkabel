import { definePlugin, ExtensionPoints, NOTIFY_SERVICE, type Kernel } from '@kabel/core';
import { FieldsConfigSchema, toGroups, type FieldsConfig } from './config';
import {
  FIELDS_PLUGIN,
  FIELDS_SERVICE,
  type FieldRaw,
  type FieldsService,
  type FieldsState,
  type FieldValue,
  type SetFieldOptions,
} from './contract';
import { isEmptyValue, normalizeValue } from './normalize';
import { fieldsActions, fieldsSlice, fieldsViewActions, fieldsViewSlice } from './slice';

/** 配置变化会重载插件：用它在重载之间保留已填写的字段值 */
const retained = new WeakMap<Kernel, FieldsState>();

/**
 * 字段模型（能力插件）：字段配置与分组来自插件配置（可在 设置 › 插件管理 中编辑），
 * 字段值带来源、复核状态与影像证据，纳入撤销；对外提供 `FIELDS_SERVICE`。
 *
 * 著录面板、框选识别、版面分析、宿主都通过同一个服务读写字段，彼此不依赖。
 */
export const fieldsPlugin = (config?: Partial<FieldsConfig>) =>
  definePlugin({
    name: FIELDS_PLUGIN,
    title: '字段模型',
    Config: FieldsConfigSchema,
    config,
    setup(ctx, options) {
      const { kernel } = ctx;
      const groups = toGroups(options);
      const all = groups.flatMap((g) => g.fields);
      const byKey = new Map(all.map((f) => [f.key, f]));

      ctx.registerSlice(fieldsSlice, retained.get(kernel));
      ctx.registerSlice(fieldsViewSlice, { groups, focus: null, errors: {} });
      ctx.onDispose(() => retained.set(kernel, kernel.getState().fields));

      const state = () => kernel.getState().fields;
      const view = () => kernel.getState().fieldsView;

      const validateField = (key: string, value: FieldRaw | undefined): string | null => {
        const field = byKey.get(key);
        if (!field) return null;
        if (field.required && isEmptyValue(value ?? null)) return `${field.label}不能为空`;
        if (field.pattern && typeof value === 'string' && value && !new RegExp(field.pattern).test(value)) return `${field.label}格式不正确`;
        return null;
      };

      const build = (key: string, raw: unknown, options: SetFieldOptions): FieldValue => {
        const source = options.source ?? 'user';
        return {
          // 人工输入按原样保存（输入过程中不裁剪空格）；机器来源按字段类型规整
          value: source === 'user' ? ((raw ?? null) as FieldRaw) : normalizeValue(byKey.get(key), raw),
          source,
          review: options.review ?? (source === 'user' ? undefined : state().values[key]?.review),
          evidence: options.evidence ?? (source === 'user' ? state().values[key]?.evidence : undefined),
          confidence: options.confidence,
        };
      };

      const commit = (entries: Record<string, FieldValue>, options: SetFieldOptions, coalesce?: string) => {
        const prev = state().values;
        const changed = Object.keys(entries).filter((key) => {
          const before = prev[key];
          const after = entries[key]!;
          return !before || JSON.stringify(before) !== JSON.stringify(after);
        });
        if (!changed.length) return [];
        const label = options.label ?? (changed.length === 1 ? `填写${byKey.get(changed[0]!)?.label ?? changed[0]}` : `填写 ${changed.length} 个字段`);
        kernel.dispatch(fieldsActions.set(Object.fromEntries(changed.map((k) => [k, entries[k]])), { history: { label, coalesce } }));
        for (const key of changed) {
          if (view().errors[key] && !validateField(key, entries[key]!.value)) kernel.dispatch(fieldsViewActions.clearError(key));
          ctx.bus.emit('field:change', { key, value: entries[key]!.value, prev: prev[key]?.value ?? null, source: entries[key]!.source });
        }
        return changed;
      };

      const order = () => all.map((f) => f.key);
      const service: FieldsService = {
        groups: () => groups,
        fields: () => all,
        field: (key) => byKey.get(key),
        get: (key) => state().values[key],
        values: () => Object.fromEntries(Object.entries(state().values).map(([k, v]) => [k, v.value])),
        normalize: (key, value) => normalizeValue(byKey.get(key), value),
        set(key, value, options = {}) {
          const entry = build(key, value, options);
          // 人工连续输入合并为一条撤销记录
          commit({ [key]: entry }, options, entry.source === 'user' ? `field:${key}` : undefined);
        },
        setMany(entries, options = {}) {
          const built = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, build(k, v, options)]));
          return commit(built, options);
        },
        load(values) {
          const loaded: Record<string, FieldValue> = {};
          for (const [key, value] of Object.entries(values)) loaded[key] = { value: normalizeValue(byKey.get(key), value), source: 'host' };
          kernel.dispatch(fieldsActions.load(loaded, { history: false }));
          kernel.dispatch(fieldsViewActions.setErrors({}));
          kernel.history.clear();
        },
        confirm: (key) => kernel.dispatch(fieldsActions.confirm([key], { history: { label: '确认字段' } })),
        confirmAll: () => kernel.dispatch(fieldsActions.confirm(service.pending(), { history: { label: '全部确认' } })),
        pending: () => order().filter((k) => state().values[k]?.review === 'pending'),
        focus(key) {
          if (key !== null && !byKey.has(key)) return;
          if (view().focus === key) return;
          kernel.dispatch(fieldsViewActions.focus(key));
          ctx.bus.emit('field:focus', { key });
        },
        focused: () => view().focus,
        next() {
          const keys = order();
          const i = keys.indexOf(view().focus ?? '');
          service.focus(keys[Math.min(keys.length - 1, i + 1)] ?? null);
        },
        prev() {
          const keys = order();
          const i = keys.indexOf(view().focus ?? '');
          service.focus(keys[Math.max(0, i - 1)] ?? null);
        },
        validate() {
          const errors: Record<string, string> = {};
          for (const key of order()) {
            const message = validateField(key, state().values[key]?.value);
            if (message) errors[key] = message;
          }
          kernel.dispatch(fieldsViewActions.setErrors(errors));
          return errors;
        },
      };
      ctx.provide(FIELDS_SERVICE, service);
      // 表单数据：字段纯值快照（与保存时 `save` 载荷的 `data` 一致）
      ctx.contribute(ExtensionPoints.formData, { id: 'fields.values', title: '字段', order: 20, collect: () => service.values() });

      ctx.registerCommand({
        id: 'fields.next',
        title: '下一个字段',
        keybinding: 'Mod+ArrowDown',
        enabled: () => all.length > 0,
        run: () => service.next(),
      });
      ctx.registerCommand({
        id: 'fields.prev',
        title: '上一个字段',
        keybinding: 'Mod+ArrowUp',
        enabled: () => all.length > 0,
        run: () => service.prev(),
      });
      ctx.registerCommand({
        id: 'fields.focus',
        title: '定位字段',
        hidden: true,
        run: (_k, key: string) => service.focus(key),
      });
      ctx.registerCommand({
        id: 'fields.confirm',
        title: '确认字段',
        hidden: true,
        mutates: true,
        run: (_k, key: string) => service.confirm(key),
      });
      ctx.registerCommand({
        id: 'fields.confirmAll',
        title: '全部确认（复核）',
        mutates: true,
        enabled: () => service.pending().length > 0,
        run: () => service.confirmAll(),
      });
      ctx.registerCommand({
        id: 'fields.validate',
        title: '校验字段',
        icon: 'validate',
        run: () => {
          const errors = Object.keys(service.validate());
          const notify = kernel.services.tryGet(NOTIFY_SERVICE);
          if (!errors.length) notify?.notify('校验通过', { type: 'success', duration: 2000 });
          else {
            service.focus(errors[0]!);
            notify?.notify(`有 ${errors.length} 个字段未通过校验`, { type: 'warning' });
          }
          return errors.length === 0;
        },
      });

      if (options.validateOnSave) {
        ctx.on('save', () => {
          const errors = Object.keys(service.validate());
          if (!errors.length) return;
          service.focus(errors[0]!);
          throw new Error(`有 ${errors.length} 个字段未通过校验`);
        });
      }
    },
  });
