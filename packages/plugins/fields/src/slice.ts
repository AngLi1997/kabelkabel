import { createSlice } from '@kabel/core';
import type { FieldGroup, FieldsState, FieldsViewState, FieldValue } from './contract';

export const fieldsSlice = createSlice({
  name: 'fields',
  initialState: { values: {} } as FieldsState,
  history: true,
  reducers: {
    set: (s: FieldsState, entries: Record<string, FieldValue | undefined>) => {
      const values = { ...s.values };
      for (const [key, value] of Object.entries(entries)) {
        if (value === undefined) delete values[key];
        else values[key] = value;
      }
      return { values };
    },
    load: (_s: FieldsState, values: Record<string, FieldValue>) => ({ values }),
    confirm: (s: FieldsState, keys: string[]) => {
      let changed = false;
      const values = { ...s.values };
      for (const key of keys) {
        const v = values[key];
        if (v?.review !== 'pending') continue;
        values[key] = { ...v, review: 'confirmed' };
        changed = true;
      }
      return changed ? { values } : s;
    },
  },
});

export const fieldsActions = fieldsSlice.actions;

export const fieldsViewSlice = createSlice({
  name: 'fieldsView',
  initialState: { groups: [], focus: null, errors: {} } as FieldsViewState,
  reducers: {
    setGroups: (s: FieldsViewState, groups: FieldGroup[]) => ({ ...s, groups }),
    focus: (s: FieldsViewState, focus: string | null) => (s.focus === focus ? s : { ...s, focus }),
    setErrors: (s: FieldsViewState, errors: Record<string, string>) => ({ ...s, errors }),
    clearError: (s: FieldsViewState, key: string) => {
      if (!(key in s.errors)) return s;
      const errors = { ...s.errors };
      delete errors[key];
      return { ...s, errors };
    },
  },
});

export const fieldsViewActions = fieldsViewSlice.actions;
