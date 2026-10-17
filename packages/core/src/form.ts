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
export function gatherFormEntries(
  kernel: Kernel,
  point: typeof ExtensionPoints.formData = ExtensionPoints.formData,
): FormDataEntry[] | Promise<FormDataEntry[]> {
  const state = kernel.getState();
  const providers = kernel.extensions
    .get(point)
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

/** 插件在表单配置中的条目 */
export interface FormConfigPlugin {
  name: string;
  title?: string;
  version?: string;
  /** `active` 已启用；`pending` 等待依赖或服务；`disabled` 已停用 */
  status: 'active' | 'pending' | 'disabled';
  builtin?: boolean;
  /** 通过 `ctx.plugin` 注册时的父插件（如场景预设） */
  parent?: string;
  /** 生效的配置（声明了 `Config` 的插件为校验后的配置，否则为注册方给定的配置） */
  config?: unknown;
  /** 配置来自用户在 设置 › 插件管理 中的保存 */
  userConfig?: boolean;
}

/** 当前表单的配置：实例 id、插件及其配置，以及各插件贡献的配置（以提供者 id 为键，如 `layout`、`theme`、`table`） */
export interface FormConfigRecord {
  instanceId: string;
  plugins: FormConfigPlugin[];
  [section: string]: unknown;
}

const SECRET_KEY = /(api[-_]?key|secret|token|password|passwd|credential)/i;

/** 隐去密钥类字段（`apiKey`、`token`、`password`…）的值，表单配置只用于查看与排查，不外泄凭据 */
export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) && typeof v === 'string' ? (v ? '******' : '') : maskSecrets(v)]),
  );
}

/** 插件列表（含停用），按注册顺序；配置中的密钥类字段已隐去 */
export function formConfigPlugins(kernel: Kernel): FormConfigPlugin[] {
  const pm = kernel.plugins;
  return [...pm.list(), ...pm.listDisabled()].map((plugin) => {
    const config = pm.getConfig(plugin.name);
    return {
      name: plugin.name,
      ...(plugin.title ? { title: plugin.title } : {}),
      ...(plugin.version ? { version: plugin.version } : {}),
      status: pm.status(plugin.name) ?? 'disabled',
      ...(plugin.builtin ? { builtin: true } : {}),
      ...(pm.parentOf(plugin.name) ? { parent: pm.parentOf(plugin.name) } : {}),
      ...(config !== undefined ? { config: maskSecrets(config) } : {}),
      ...(pm.hasStoredConfig(plugin.name) ? { userConfig: true } : {}),
    };
  });
}

/** 表单配置的各分组（插件列表在最前），供“表单配置”页逐项展示 */
export async function collectFormConfigEntries(kernel: Kernel): Promise<FormDataEntry[]> {
  const sections = (await gatherFormEntries(kernel, ExtensionPoints.formConfig)).map((e) => ({ ...e, data: maskSecrets(e.data) }));
  return [{ id: 'plugins', title: '插件', data: formConfigPlugins(kernel) }, ...sections];
}

/** 汇总表单配置：`{ instanceId, plugins, layout, theme, … }`；单个提供者失败时该项为 `{ error }` */
export async function collectFormConfig(kernel: Kernel): Promise<FormConfigRecord> {
  const entries = await collectFormConfigEntries(kernel);
  const record: FormConfigRecord = { instanceId: kernel.id, plugins: [] };
  for (const e of entries) record[e.id] = e.error !== undefined ? { error: e.error } : e.data;
  return record;
}
