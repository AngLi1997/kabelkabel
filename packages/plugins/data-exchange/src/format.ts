import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ExchangeData, ExchangeFormat } from './contract';

export const FORMAT_MIME: Record<ExchangeFormat, string> = {
  json: 'application/json',
  yaml: 'application/yaml',
};

export const FORMAT_EXT: Record<ExchangeFormat, string> = { json: 'json', yaml: 'yaml' };

export function serialize(data: unknown, format: ExchangeFormat): string {
  return format === 'yaml' ? stringifyYaml(data) : `${JSON.stringify(data, null, 2)}\n`;
}

/** 解析 JSON / YAML 文本；结果必须是对象 */
export function deserialize(text: string, format: ExchangeFormat): ExchangeData {
  let data: unknown;
  try {
    data = format === 'yaml' ? parseYaml(text) : JSON.parse(text);
  } catch (error) {
    throw new Error(`${format.toUpperCase()} 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('数据格式不正确：根节点应为对象');
  return data as ExchangeData;
}

/** 按文件名推断格式 */
export function formatOfName(name: string): ExchangeFormat | undefined {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return undefined;
}

const segments = (path: string) => path.split('.').map((s) => s.trim()).filter(Boolean);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 读取 `a.b.c` 路径的值；空路径返回对象本身 */
export function getPath(source: unknown, path: string): unknown {
  let current = source;
  for (const key of segments(path)) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** 写入 `a.b.c` 路径，中间层不存在时创建 */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = segments(path);
  if (!keys.length) return;
  let current = target;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}
