import { ExtensionPoints } from './contributions';
import type { Kernel } from './kernel';

/** 一个提供者的收集结果 */
export interface FormDataEntry {
  id: string;
  title: string;
  data?: unknown;
  /** 收集失败时的错误信息 */
  error?: string;
}

/** 当前表单下全部插件的提交数据，以提供者 `id` 为键 */
export type FormDataRecord = Record<string, unknown>;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  !!v && (typeof v === 'object' || typeof v === 'function') && typeof (v as PromiseLike<unknown>).then === 'function';

/**
 * 调用 `ExtensionPoints.formData` 的全部提供者（按 order）；单个失败只记录在该条目上。
 * 提供者都同步返回时结果也同步返回，保证保存流程不因此多等一个微任务。
 */
export function gatherFormEntries(kernel: Kernel): FormDataEntry[] | Promise<FormDataEntry[]> {
  const state = kernel.getState();
  const providers = kernel.extensions
    .get(ExtensionPoints.formData)
    .getAll()
    .filter((p) => !p.when || p.when(state, kernel));
  let pending = false;
  const entries = providers.map((p): FormDataEntry | Promise<FormDataEntry> => {
    try {
      const data = p.collect(kernel);
      if (!isThenable(data)) return { id: p.id, title: p.title, data };
      pending = true;
      return Promise.resolve(data).then(
        (value) => ({ id: p.id, title: p.title, data: value }),
        (error) => ({ id: p.id, title: p.title, error: messageOf(error) }),
      );
    } catch (error) {
      return { id: p.id, title: p.title, error: messageOf(error) };
    }
  });
  return pending ? Promise.all(entries) : (entries as FormDataEntry[]);
}

export const collectFormEntries = async (kernel: Kernel): Promise<FormDataEntry[]> => gatherFormEntries(kernel);

const toRecord = (entries: FormDataEntry[]): FormDataRecord => {
  const data: FormDataRecord = {};
  for (const entry of entries) {
    if (entry.error !== undefined) throw new Error(`${entry.title}：${entry.error}`);
    data[entry.id] = entry.data;
  }
  return data;
};

/** 汇总全部提交数据（同步或异步）；任一提供者失败则抛出（保存流程据此失败） */
export function gatherFormData(kernel: Kernel): FormDataRecord | Promise<FormDataRecord> {
  const entries = gatherFormEntries(kernel);
  return Array.isArray(entries) ? toRecord(entries) : entries.then(toRecord);
}

/** 汇总全部提交数据；任一提供者失败则 reject */
export const collectFormData = async (kernel: Kernel): Promise<FormDataRecord> => gatherFormData(kernel);
