import { definePlugin, ExtensionPoints, NOTIFY_SERVICE } from '@kabel/core';
import { WORKSPACE_PLUGIN, WORKSPACE_SERVICE, type ImageObjectInput } from '@kabel/plugin-workspace';
import {
  FILE_LOADER_PLUGIN,
  FILE_LOADER_SERVICE,
  type FileEntry,
  type FileLoadResult,
  type FileLoadSource,
  type FileLoaderService,
  type MinioConfig,
} from './contract';
import { DEFAULT_IMAGE_EXTENSIONS, selectImages } from './filter';
import { listMinioEntries } from './minio';
import { entriesFromFiles, pickDirectory } from './local';
import { fileLoaderActions, fileLoaderSlice } from './slice';
import { LoaderToolbar } from './ui';
import { parseUrlList, urlEntries } from './urls';

export interface FileLoaderOptions {
  /** 视为影像的扩展名（无 MIME 信息时使用），默认 jpg/png/gif/webp/bmp/svg/avif/tif */
  extensions?: readonly string[];
  /** MinIO 对话框的预填值；`accessKey`/`secretKey` 仅在内存中使用，不会持久化 */
  minio?: Partial<MinioConfig>;
  /** 自定义 MinIO 签名（如向后端换取预签名地址）；提供后不再在浏览器中使用密钥 */
  signUrl?: (url: string) => string | Promise<string>;
  /** 工具栏入口，默认显示在左侧；`false` 不注册（宿主自行通过命令/服务触发） */
  toolbar?: { group?: 'start' | 'end'; order?: number } | false;
}

const toImageInput = (e: FileEntry): ImageObjectInput => ({
  name: e.name,
  group: e.group,
  ...(e.file ? { file: e.file } : { url: e.url }),
});

/**
 * 文件加载：把 MinIO 桶+路径、本地目录、URL 列表中的影像批量交给工作台，自动显示到影像舞台。
 *
 * - **来源**：`loadMinio` / `openDirectory`（`loadFiles`）/ `loadUrls`，均归一化为条目，过滤出影像并自然排序；
 * - **目录分组**：子目录路径作为文件目录的分组；
 * - **入口**：工具栏“打开”菜单，与命令 `fileLoader.openDirectory | openUrls | openMinio`；
 * - **对接**：只依赖 `kabel:workspace`，通过 `WORKSPACE_SERVICE.setImages` 写入文档模型，加载完成后派发 `file-loader:load`。
 */
export const fileLoaderPlugin = (options: FileLoaderOptions = {}) =>
  definePlugin({
    name: FILE_LOADER_PLUGIN,
    title: '文件加载',
    dependencies: [WORKSPACE_PLUGIN],
    setup(ctx) {
      const { kernel } = ctx;
      const workspace = () => kernel.services.get(WORKSPACE_SERVICE);
      const notify = kernel.services.tryGet(NOTIFY_SERVICE);
      const setBusy = (busy: boolean) => kernel.dispatch(fileLoaderActions.setBusy(busy));
      ctx.registerSlice(fileLoaderSlice);

      // 归一化后统一入口：过滤影像 → 排序 → 交给工作台
      const deliver = async (source: FileLoadSource, entries: FileEntry[]): Promise<FileLoadResult> => {
        const { images, skipped } = selectImages(entries, options.extensions ?? DEFAULT_IMAGE_EXTENSIONS);
        if (!images.length) {
          notify?.notify(entries.length ? '没有可显示的影像文件' : '没有找到文件', { type: 'warning' });
          return { source, loaded: 0, skipped };
        }
        await workspace().setImages(images.map(toImageInput));
        const result: FileLoadResult = { source, loaded: images.length, skipped };
        ctx.bus.emit('file-loader:load', result);
        notify?.notify(skipped ? `已加载 ${images.length} 个影像，跳过 ${skipped} 个非影像文件` : `已加载 ${images.length} 个影像`, { type: 'success' });
        return result;
      };

      // 加载期间显示忙碌状态；失败时提示并继续抛出，便于宿主处理
      const guarded = async <T,>(task: () => Promise<T>): Promise<T> => {
        setBusy(true);
        workspace().setLoading(true);
        try {
          return await task();
        } catch (error) {
          notify?.notify(error instanceof Error ? error.message : String(error), { type: 'error' });
          throw error;
        } finally {
          setBusy(false);
          workspace().setLoading(false);
        }
      };

      const service: FileLoaderService = {
        loadUrls: (input) =>
          guarded(async () => {
            const urls = parseUrlList(input);
            if (!urls.length) throw new Error('请输入至少一个 URL');
            return deliver('urls', urlEntries(urls));
          }),
        loadMinio: (config) =>
          guarded(async () => deliver('minio', await listMinioEntries(config, { sign: options.signUrl }))),
        loadFiles: (files) => guarded(async () => deliver('directory', entriesFromFiles(files))),
        openDirectory: async () => {
          const entries = await pickDirectory();
          return entries ? guarded(() => deliver('directory', entries)) : null;
        },
      };
      ctx.provide(FILE_LOADER_SERVICE, service);

      const openDialog = (dialog: 'urls' | 'minio') => kernel.dispatch(fileLoaderActions.openDialog(dialog));
      const idle = () => !kernel.getState().fileLoader.busy;
      ctx.registerCommand({ id: 'fileLoader.openDirectory', title: '打开本地目录', icon: 'folder', enabled: idle, run: () => void service.openDirectory().catch(() => {}) });
      ctx.registerCommand({ id: 'fileLoader.openUrls', title: '从 URL 列表加载', icon: 'link', enabled: idle, run: () => openDialog('urls') });
      ctx.registerCommand({ id: 'fileLoader.openMinio', title: '从 MinIO 加载', icon: 'folder', enabled: idle, run: () => openDialog('minio') });
      ctx.onDispose(() => kernel.dispatch(fileLoaderActions.openDialog(null)));

      if (options.toolbar !== false) {
        ctx.contribute(ExtensionPoints.toolbar, {
          id: 'fileLoader.open',
          type: 'view',
          group: options.toolbar?.group ?? 'start',
          order: options.toolbar?.order ?? 5,
          view: (props) => <LoaderToolbar kernel={props.kernel} defaults={options.minio} />,
        });
      }
    },
  });
