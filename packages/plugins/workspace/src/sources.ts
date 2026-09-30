import type { DocumentItem } from './documents/types';

/** 对象形式的图片源，字段任选其一：url/src、base64、blob/file、data */
export interface ImageObjectInput {
  id?: string;
  name?: string;
  /** 所属目录（如“正文”“附件”），缩略图按目录分组显示 */
  group?: string;
  url?: string;
  src?: string;
  base64?: string;
  blob?: Blob;
  file?: File;
  data?: ArrayBuffer | Uint8Array;
  /** base64 / 二进制数据的 MIME，缺省时根据文件头自动识别 */
  mime?: string;
  thumbnail?: string | Blob;
}

/** 异步加载器：适用于需要鉴权下载、按需获取的影像 */
export type ImageLoader = () => Promise<Exclude<ImageSourceInput, ImageLoader>>;

/**
 * 支持的图片源：
 * - `string`：http(s)/相对路径 URL、`data:` URL、`blob:` URL、或不带前缀的纯 base64
 * - `Blob` / `File`、`ArrayBuffer` / `Uint8Array`
 * - `ImageObjectInput` 对象
 * - `ImageLoader` 异步函数
 */
export type ImageSourceInput = string | Blob | ArrayBuffer | Uint8Array | ImageObjectInput | ImageLoader;

/** 影像文件：文档模型中 `kind: 'image'` 的文件项 */
export interface ImageItem extends DocumentItem {
  kind: 'image';
  /** 缩略图地址，缺省为原图 */
  thumbnail: string;
}

const BASE64_SIGNATURES: [string, string][] = [
  ['/9j/', 'image/jpeg'],
  ['iVBORw0KGgo', 'image/png'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['Qk', 'image/bmp'],
  ['PHN2Zy', 'image/svg+xml'],
  ['PD94bWwg', 'image/svg+xml'],
];

export function sniffBase64Mime(base64: string): string {
  const head = base64.trimStart();
  return BASE64_SIGNATURES.find(([sig]) => head.startsWith(sig))?.[1] ?? 'image/png';
}

export function sniffBytesMime(bytes: Uint8Array): string {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return 'application/octet-stream';
}

const URL_LIKE = /^(https?:|data:|blob:|file:|\/\/|\/|\.{1,2}\/)/i;
const BASE64_BODY = /^[A-Za-z0-9+/\s]+={0,2}$/;

export function isRawBase64(value: string): boolean {
  return !URL_LIKE.test(value) && value.length >= 16 && BASE64_BODY.test(value);
}

export function base64ToDataUrl(base64: string, mime?: string): string {
  if (base64.startsWith('data:')) return base64;
  const clean = base64.replace(/\s+/g, '');
  return `data:${mime ?? sniffBase64Mime(clean)};base64,${clean}`;
}

export interface UrlFactory {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export const browserUrlFactory: UrlFactory = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export interface ResolvedImage {
  item: ImageItem;
  /** 为该图片创建的 object URL，替换或卸载时需要释放 */
  objectUrls: string[];
}

const nameFromUrl = (url: string) => {
  if (url.startsWith('data:') || url.startsWith('blob:') || isRawBase64(url)) return '';
  try {
    return decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? '');
  } catch {
    return '';
  }
};

/** 同步归一化一个非加载器的图片源 */
export function resolveImage(input: Exclude<ImageSourceInput, ImageLoader>, index: number, urls: UrlFactory = browserUrlFactory): ResolvedImage {
  const objectUrls: string[] = [];
  const fromBlob = (blob: Blob) => {
    const url = urls.create(blob);
    objectUrls.push(url);
    return url;
  };
  const fromBytes = (data: ArrayBuffer | Uint8Array, mime?: string) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return fromBlob(new Blob([bytes as BlobPart], { type: mime ?? sniffBytesMime(bytes) }));
  };
  const fromString = (value: string, mime?: string) => (isRawBase64(value) ? base64ToDataUrl(value, mime) : value);

  let src: string;
  let name = '';
  let id: string | undefined;
  let thumbnail: string | undefined;
  let group: string | undefined;

  if (typeof input === 'string') {
    src = fromString(input);
    name = nameFromUrl(input);
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    src = fromBlob(input);
    name = (input as File).name ?? '';
  } else if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    src = fromBytes(input);
  } else {
    const obj = input as ImageObjectInput;
    id = obj.id;
    group = obj.group || undefined;
    const blob = obj.file ?? obj.blob;
    if (obj.url ?? obj.src) src = fromString((obj.url ?? obj.src)!, obj.mime);
    else if (obj.base64) src = base64ToDataUrl(obj.base64, obj.mime);
    else if (blob) src = fromBlob(blob);
    else if (obj.data) src = fromBytes(obj.data, obj.mime);
    else throw new Error(`[kabel] image #${index + 1} has no source`);
    name = obj.name ?? obj.file?.name ?? nameFromUrl(obj.url ?? obj.src ?? '');
    if (obj.thumbnail) thumbnail = typeof obj.thumbnail === 'string' ? fromString(obj.thumbnail) : fromBlob(obj.thumbnail);
  }

  return {
    item: {
      id: id ?? `image-${index + 1}`,
      kind: 'image',
      name: name || `第 ${index + 1} 页`,
      src,
      thumbnail: thumbnail ?? src,
      ...(group ? { group } : {}),
    },
    objectUrls,
  };
}
