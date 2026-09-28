import { createSlice, shallowEqual } from '@kabel/core';
import { normalizeSchema } from './schema';
import type { MetadataState, NormalizedSchema, RecordState, RecordValues } from './types';

/** 档案著录值：纳入撤销/重做 */
export const recordSlice = createSlice({
  name: 'record',
  history: true,
  initialState: (): RecordState => ({ values: {} }),
  reducers: {
    setField: (s: RecordState, p: { key: string; value: unknown }) =>
      Object.is(s.values[p.key], p.value) ? s : { ...s, values: { ...s.values, [p.key]: p.value } },
    setValues: (s: RecordState, values: RecordValues) => {
      const next = { ...s.values, ...values };
      return shallowEqual(next, s.values) ? s : { ...s, values: next };
    },
    load: (_s: RecordState, record: RecordState) => ({ id: record.id, values: { ...record.values } }),
  },
});

export function createMetadataState(schema: NormalizedSchema, readonly = false): MetadataState {
  return {
    schema,
    readonly,
    collapsed: Object.fromEntries(schema.groups.map((g) => [g.key, g.collapsed])),
    touched: {},
    errors: {},
    validatedAt: null,
    saving: false,
    savedAt: null,
    saveError: null,
    filling: false,
  };
}

/** 编辑器界面状态：不纳入撤销/重做 */
export const metadataSlice = createSlice({
  name: 'metadata',
  initialState: () => createMetadataState(normalizeSchema(undefined)),
  reducers: {
    setSchema: (s: MetadataState, schema: NormalizedSchema) => ({
      ...createMetadataState(schema, s.readonly),
      savedAt: s.savedAt,
      filling: s.filling,
    }),
    setFilling: (s: MetadataState, filling: boolean) => (s.filling === filling ? s : { ...s, filling }),
    setReadonly: (s: MetadataState, readonly: boolean) => (s.readonly === readonly ? s : { ...s, readonly }),
    toggleGroup: (s: MetadataState, key: string) => ({ ...s, collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } }),
    setGroupCollapsed: (s: MetadataState, p: { key: string; collapsed: boolean }) =>
      !!s.collapsed[p.key] === p.collapsed ? s : { ...s, collapsed: { ...s.collapsed, [p.key]: p.collapsed } },
    setAllCollapsed: (s: MetadataState, collapsed: boolean) => ({
      ...s,
      collapsed: Object.fromEntries(s.schema.groups.map((g) => [g.key, collapsed])),
    }),
    touch: (s: MetadataState, key: string) => (s.touched[key] ? s : { ...s, touched: { ...s.touched, [key]: true } }),
    setErrors: (s: MetadataState, errors: Record<string, string>) => (shallowEqual(s.errors, errors) ? s : { ...s, errors }),
    markValidated: (s: MetadataState, time: number) => ({ ...s, validatedAt: time }),
    resetValidation: (s: MetadataState) => ({ ...s, touched: {}, errors: {}, validatedAt: null }),
    saveStart: (s: MetadataState) => ({ ...s, saving: true, saveError: null }),
    saveSuccess: (s: MetadataState, time: number) => ({ ...s, saving: false, savedAt: time }),
    saveFailure: (s: MetadataState, message: string) => ({ ...s, saving: false, saveError: message }),
  },
});

export const recordActions = recordSlice.actions;
export const metadataActions = metadataSlice.actions;
