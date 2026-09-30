import type { FileEntry, MinioConfig } from './contract';

const encoder = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? encoder.encode(key) : key;
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, encoder.encode(data));
}

/** RFC 3986 编码（比 encodeURIComponent 多编码 `!'()*`） */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface PresignOptions {
  accessKey: string;
  secretKey: string;
  region?: string;
  /** 有效期（秒），默认 3600 */
  expires?: number;
  /** 便于测试的固定时间 */
  now?: Date;
}

/** AWS Signature V4 查询串预签名（GET）：签名放在 URL 中，`<img src>` 可直接使用，无需 fetch 后转 Blob */
export async function presignUrl(url: string, options: PresignOptions): Promise<string> {
  const u = new URL(url);
  const region = options.region ?? 'us-east-1';
  const stamp = (options.now ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;

  const query: [string, string][] = [...u.searchParams.entries()];
  query.push(
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${options.accessKey}/${scope}`],
    ['X-Amz-Date', stamp],
    ['X-Amz-Expires', String(options.expires ?? 3600)],
    ['X-Amz-SignedHeaders', 'host'],
  );
  const canonicalQuery = query
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  // pathname 已是 URL 编码形式；统一用 RFC 3986 重新编码每一段
  const canonicalPath = u.pathname
    .split('/')
    .map((seg) => rfc3986(decodeURIComponent(seg)))
    .join('/');
  const canonicalRequest = ['GET', canonicalPath, canonicalQuery, `host:${u.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, await sha256(canonicalRequest)].join('\n');

  let key = await hmac(`AWS4${options.secretKey}`, day);
  for (const part of [region, 's3', 'aws4_request']) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));
  return `${u.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');
const base = (config: MinioConfig) => `${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}`;
const objectUrl = (config: MinioConfig, key: string) => `${base(config)}/${key.split('/').map(rfc3986).join('/')}`;

/** 规范化前缀：去掉首部 `/`，非空时补尾部 `/`，避免 `case-1` 匹配到 `case-10` */
export const normalizePrefix = (prefix = '') => {
  const p = trimSlashes(prefix);
  return p ? `${p}/` : '';
};

/** 解析 ListObjectsV2 的 XML 响应 */
export function parseListResult(xml: string): { keys: string[]; next?: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MinIO 返回了无法解析的内容');
  const err = doc.querySelector('Error > Message');
  if (err) throw new Error(err.textContent ?? 'MinIO 请求失败');
  const keys = Array.from(doc.querySelectorAll('Contents > Key'), (n) => n.textContent ?? '').filter((k) => k && !k.endsWith('/'));
  const truncated = doc.querySelector('IsTruncated')?.textContent === 'true';
  return { keys, next: truncated ? (doc.querySelector('NextContinuationToken')?.textContent ?? undefined) : undefined };
}

export interface MinioListOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** 自定义签名（如向后端换取预签名地址）；缺省时用 accessKey/secretKey 本地签名，二者都没有则不签名 */
  sign?: (url: string) => string | Promise<string>;
  now?: Date;
}

/**
 * 列出桶内某路径下的全部对象并生成可直接展示的地址。
 * 需要在 MinIO 上为页面来源配置 CORS（至少允许 GET、HEAD）。
 */
export async function listMinioEntries(config: MinioConfig, options: MinioListOptions = {}): Promise<FileEntry[]> {
  if (!config.endpoint.trim() || !config.bucket.trim()) throw new Error('请填写 MinIO 地址与桶名称');
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const prefix = normalizePrefix(config.prefix);
  const recursive = config.recursive ?? true;
  const sign = async (url: string) => {
    if (options.sign) return options.sign(url);
    if (config.accessKey && config.secretKey) {
      return presignUrl(url, { accessKey: config.accessKey, secretKey: config.secretKey, region: config.region, expires: config.expires, now: options.now });
    }
    return url;
  };

  const keys: string[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
    if (!recursive) q.set('delimiter', '/');
    if (token) q.set('continuation-token', token);
    const response = await doFetch(await sign(`${base(config)}/?${q}`), { signal: options.signal });
    const text = await response.text();
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        parseListResult(text);
      } catch (e) {
        message = (e as Error).message;
      }
      throw new Error(`列出 MinIO 对象失败：${message}`);
    }
    const page = parseListResult(text);
    keys.push(...page.keys);
    token = page.next;
  } while (token);

  return Promise.all(
    keys.map(async (key) => {
      const rel = key.slice(prefix.length);
      const slash = rel.lastIndexOf('/');
      return {
        name: rel.slice(slash + 1),
        group: slash > 0 ? rel.slice(0, slash) : undefined,
        url: await sign(objectUrl(config, key)),
      } satisfies FileEntry;
    }),
  );
}
