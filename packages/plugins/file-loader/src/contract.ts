import { createServiceToken } from '@kabel/core';

export const FILE_LOADER_PLUGIN = 'kabel:file-loader';

/** MinIO / S3 兼容存储的连接配置 */
export interface MinioConfig {
  /** 服务地址，如 `https://minio.example.com` 或 `http://127.0.0.1:9000`（路径风格寻址） */
  endpoint: string;
  bucket: string;
  /** 桶内路径前缀，如 `2024/case-01/`，留空加载整个桶 */
  prefix?: string;
  /** 访问密钥；桶为公开读时可不填，直接使用对象地址 */
  accessKey?: string;
  secretKey?: string;
  /** 签名区域，默认 `us-east-1`（MinIO 默认值） */
  region?: string;
  /** 预签名地址有效期（秒），默认 3600 */
  expires?: number;
  /** 是否递归子目录，默认 true；子目录名作为文件目录的分组 */
  recursive?: boolean;
}

/** 一次加载的结果 */
export interface FileLoadResult {
  source: FileLoadSource;
  /** 已交给影像舞台的文件数 */
  loaded: number;
  /** 因不是受支持的影像类型而跳过的文件数 */
  skipped: number;
}

export type FileLoadSource = 'minio' | 'directory' | 'urls' | 'files';

/** 待加载的一个文件条目（来源无关的中间形态） */
export interface FileEntry {
  name: string;
  /** 相对加载根目录的目录路径，用作文件目录分组；根目录下的文件为空 */
  group?: string;
  /** 远程地址（URL / 预签名地址） */
  url?: string;
  /** 本地文件 */
  file?: File;
  mime?: string;
}

export interface FileLoaderService {
  /** 加载 URL 列表（数组，或按换行/逗号分隔的文本） */
  loadUrls(urls: readonly string[] | string): Promise<FileLoadResult>;
  /** 列出 MinIO 桶+路径下的对象并加载 */
  loadMinio(config: MinioConfig): Promise<FileLoadResult>;
  /** 加载已有的本地文件（如拖拽、`<input type=file>` 得到的 `File`）；`webkitRelativePath` 用作分组 */
  loadFiles(files: Iterable<File>): Promise<FileLoadResult>;
  /** 弹出系统目录选择器并加载其中的文件；用户取消返回 null。必须在用户手势（点击）中调用 */
  openDirectory(): Promise<FileLoadResult | null>;
}

export const FILE_LOADER_SERVICE = createServiceToken<FileLoaderService>('kabel.fileLoader');

declare module '@kabel/core' {
  interface KabelEvents {
    /**
     * 一批文件已交给工作台。
     * @mode emit
     */
    'file-loader:load': FileLoadResult;
  }
}
