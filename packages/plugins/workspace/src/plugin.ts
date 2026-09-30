import { createServiceToken, definePlugin, toDisposable, type Disposable, ExtensionPoints, isPromiseLike, NOTIFY_SERVICE, type PanelContribution } from '@kabel/core';
import { ContentPanel } from './documents/ContentPanel';
import { FileList } from './documents/FileList';
import { documentPosition, documentsActions, documentsSlice, initialDocumentsState } from './documents/slice';
import type { DocumentItem } from './documents/types';
import { WorkspaceExtensions } from './extensions';
import { ImageRenderer } from './ImageRenderer';
import { browserUrlFactory, resolveImage, type ImageItem, type ImageSourceInput, type UrlFactory } from './sources';
import { currentScale, stageActions, stageSlice, ZOOM_STEP, type StageState } from './stage';

type PanelOptions = Partial<Pick<PanelContribution, 'title' | 'region' | 'order'>>;

export interface WorkspacePluginOptions {
  /** 初始影像：URL、base64、Blob、二进制、对象或异步加载器，解析后写入文档模型 */
  images?: readonly ImageSourceInput[];
  /** 初始文件（已解析的文件项，用于非图片类型或自行解析的来源） */
  items?: DocumentItem[];
  /** 影像舞台内是否显示缩略图条，默认 false（文件目录已提供导航） */
  thumbnails?: boolean;
  /** 文件目录面板，默认位于左侧；`false` 不注册 */
  directory?: PanelOptions | false;
  /** 内容面板，默认位于中间 */
  content?: PanelOptions;
  /** 自定义 object URL 管理（测试或 SSR 场景） */
  urlFactory?: UrlFactory;
}

/**
 * 工作台服务：业务插件读写“当前打开的文件”与舞台状态的统一入口。
 * 业务插件应只依赖 `kabel:workspace` 与本服务，不要依赖影像渲染的内部实现。
 */
export interface WorkspaceService {
  /** 打开一组影像（解析后写入文档模型）；包含异步加载器时返回的 Promise 在全部加载后完成 */
  setImages(inputs: readonly ImageSourceInput[]): Promise<void>;
  /** 直接设置已解析的文件列表，并回到第一个文件 */
  setDocuments(items: DocumentItem[]): void;
  getDocuments(): DocumentItem[];
  /** 当前文件 */
  current(): DocumentItem | undefined;
  /** 当前打开的全部影像 */
  getImages(): ImageItem[];
  goto(index: number): void;
  setLoading(loading: boolean): void;
  /** 影像舞台状态快照（缩放、旋转、适应窗口比例、当前交互工具） */
  getStage(): StageState;
  /**
   * 租用舞台指针：同一时刻只有一个交互工具，租用期间左键交给该工具的覆盖层，
   * 平移改为 空格 + 左键（或中键）。新租约抢占旧租约，旧租约的持有者会收到 `stage:tool-change`
   * 并应自行退出。返回的 Disposable 用于归还；已被抢占的租约归还时无副作用。
   * 插件应 `ctx.onDispose(lease)`，卸载时自动归还。
   */
  acquireTool(id: string, options?: { cursor?: string }): Disposable;
}

declare module '@kabel/core' {
  interface KabelEvents {
    /**
     * 舞台交互工具变化（占用、归还或被抢占）。
     * @mode emit
     */
    'stage:tool-change': { active: string | null; previous: string | null };
  }
}

export const WORKSPACE_SERVICE = createServiceToken<WorkspaceService>('kabel.workspace');
export const WORKSPACE_PLUGIN = 'kabel:workspace';

/**
 * 工作台：所有业务插件的底座。
 *
 * - **文档模型**：当前打开的文件列表与当前文件（`state.documents`），左侧文件目录与中间内容面板；
 * - **渲染器**：内容面板按文件 `kind` 选择渲染器（`WorkspaceExtensions.renderers`），内置影像渲染器；
 * - **舞台**：影像的缩放 / 旋转 / 平移坐标系（`state.stage`），提供覆盖层与工具条扩展点
 *   （`WorkspaceExtensions.overlays` / `tools`），业务插件在舞台上叠加标注、选区、水印等；
 * - **服务与事件**：`WORKSPACE_SERVICE`、`document:change`。
 *
 * 左侧目录、内容面板、影像渲染器都是普通贡献项，宿主或插件用相同 id 贡献即可替换。
 */
export const workspacePlugin = (options: WorkspacePluginOptions = {}) =>
  definePlugin({
    name: WORKSPACE_PLUGIN,
    title: '工作台',
    builtin: true,
    setup(ctx) {
      const { kernel } = ctx;
      const urls = options.urlFactory ?? browserUrlFactory;
      const documents = () => kernel.getState().documents;

      // ---------- 文档模型 ----------
      ctx.registerSlice(documentsSlice, { ...initialDocumentsState, items: options.items ?? [] });
      ctx.watch(
        (s) => s.documents.items[s.documents.index],
        (document) => ctx.bus.emit('document:change', { index: documents().index, document }),
      );
      ctx.registerCommand({
        id: 'workspace.prev',
        title: '上一个文件',
        enabled: () => documents().index > 0,
        run: () => kernel.dispatch(documentsActions.prev()),
      });
      ctx.registerCommand({
        id: 'workspace.next',
        title: '下一个文件',
        enabled: () => documents().index < documents().items.length - 1,
        run: () => kernel.dispatch(documentsActions.next()),
      });
      ctx.registerCommand({
        id: 'workspace.goto',
        title: '跳转到文件',
        hidden: true,
        run: (_k, index: number) => kernel.dispatch(documentsActions.goto(index)),
      });

      // ---------- 舞台 ----------
      const prefs = ctx.storage.get<{ thumbnails?: boolean; thumbSize?: number }>('prefs', {});
      ctx.registerSlice(stageSlice, {
        ...stageSlice.getInitialState(),
        thumbnails: prefs.thumbnails ?? options.thumbnails ?? false,
        thumbSize: prefs.thumbSize ?? 88,
      });
      ctx.watch(
        (s) => (s.stage ? `${s.stage.thumbnails}|${s.stage.thumbSize}` : ''),
        () => {
          const { thumbnails, thumbSize } = kernel.getState().stage;
          ctx.storage.set('prefs', { thumbnails, thumbSize });
        },
      );
      // 切换文件时恢复适应窗口与不旋转
      ctx.watch(
        (s) => s.documents.items[s.documents.index]?.id,
        () => kernel.dispatch(stageActions.reset()),
      );

      // ---------- 影像来源解析 ----------
      let owned: string[] = [];
      let generation = 0;
      const release = () => {
        owned.forEach((u) => urls.revoke(u));
        owned = [];
      };
      ctx.onDispose(release);

      const setLoading = (loading: boolean) => kernel.dispatch(documentsActions.setLoading(loading));
      const setImages = async (inputs: readonly ImageSourceInput[]) => {
        const current = ++generation;
        setLoading(true);
        try {
          const loaded = await Promise.all(
            inputs.map((input) => {
              if (typeof input !== 'function') return input;
              const result = input();
              return isPromiseLike(result) ? result : Promise.resolve(result);
            }),
          );
          if (current !== generation) return;
          const resolved = loaded.map((input, i) => resolveImage(input, i, urls));
          release();
          owned = resolved.flatMap((r) => r.objectUrls);
          kernel.dispatch(documentsActions.set(resolved.map((r) => r.item)));
        } finally {
          if (current === generation) setLoading(false);
        }
      };

      let lease: symbol | null = null;
      const service: WorkspaceService = {
        setImages,
        setDocuments: (items) => {
          // 直接设置文件会使尚未完成的影像加载失效
          generation += 1;
          release();
          kernel.dispatch(documentsActions.set(items));
        },
        getDocuments: () => documents().items,
        current: () => documents().items[documents().index],
        getImages: () => documents().items.filter((d): d is ImageItem => d.kind === 'image'),
        goto: (index) => kernel.dispatch(documentsActions.goto(index)),
        setLoading,
        getStage: () => kernel.getState().stage,
        acquireTool: (id, toolOptions) => {
          const previous = kernel.getState().stage.tool?.id ?? null;
          const token = Symbol(id);
          lease = token;
          kernel.dispatch(stageActions.setTool({ id, cursor: toolOptions?.cursor }));
          if (previous !== id) ctx.bus.emit('stage:tool-change', { active: id, previous });
          return toDisposable(() => {
            if (lease !== token) return;
            lease = null;
            kernel.dispatch(stageActions.setTool(null));
            ctx.bus.emit('stage:tool-change', { active: null, previous: id });
          });
        },
      };
      ctx.provide(WORKSPACE_SERVICE, service);

      // ---------- 命令（舞台） ----------
      const hasImage = () => service.current()?.kind === 'image';
      const stageCommands: [string, string, () => void, (() => boolean)?][] = [
        ['workspace.zoomIn', '放大', () => kernel.dispatch(stageActions.zoomBy(ZOOM_STEP)), hasImage],
        ['workspace.zoomOut', '缩小', () => kernel.dispatch(stageActions.zoomBy(1 / ZOOM_STEP)), hasImage],
        ['workspace.fit', '适应窗口', () => kernel.dispatch(stageActions.setZoom('fit')), hasImage],
        ['workspace.actual', '原始大小', () => kernel.dispatch(stageActions.setZoom(1)), hasImage],
        ['workspace.rotateLeft', '向左旋转', () => kernel.dispatch(stageActions.rotate(-90)), hasImage],
        ['workspace.rotateRight', '向右旋转', () => kernel.dispatch(stageActions.rotate(90)), hasImage],
        ['workspace.toggleThumbnails', '缩略图', () => kernel.dispatch(stageActions.toggleThumbnails())],
      ];
      for (const [id, title, run, enabled] of stageCommands) {
        ctx.registerCommand({ id, title, run, enabled: enabled && (() => enabled()) });
      }

      // ---------- 面板与渲染器 ----------
      if (options.directory !== false) {
        ctx.contribute(ExtensionPoints.panels, {
          id: 'workspace.files',
          region: options.directory?.region ?? 'left',
          title: options.directory?.title ?? '文件目录',
          icon: 'folder',
          order: options.directory?.order ?? 10,
          view: FileList,
        });
      }
      ctx.contribute(ExtensionPoints.panels, {
        id: 'workspace.content',
        region: options.content?.region ?? 'main',
        title: options.content?.title ?? '内容',
        order: options.content?.order ?? 10,
        view: ContentPanel,
      });
      ctx.contribute(WorkspaceExtensions.renderers, {
        id: 'workspace.image',
        match: (doc) => doc.kind === 'image',
        view: ImageRenderer,
      });

      // ---------- 状态栏与右键菜单 ----------
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'workspace.position',
        align: 'right',
        order: 9,
        icon: 'file',
        text: (s) => {
          if (!s.documents?.items.length) return null;
          const p = documentPosition(s.documents);
          return p.group ? `${p.group} ${p.groupPage}/${p.groupTotal} · 共 ${p.total} 个` : `第 ${p.page}/${p.total} 个`;
        },
      });
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'workspace.zoom',
        align: 'right',
        order: 10,
        icon: 'image',
        text: (s) => (s.documents?.items[s.documents.index]?.kind === 'image' ? `${Math.round(currentScale(s.stage) * 100)}%` : null),
      });
      ctx.contribute(
        ExtensionPoints.contextMenu,
        {
          id: 'workspace.ctx.open',
          target: 'document',
          group: 'open',
          label: '打开',
          onClick: (k, c) => k.execute('workspace.goto', Number(c.data)),
        },
        {
          id: 'workspace.ctx.copyName',
          target: 'document',
          group: 'copy',
          label: '复制文件名',
          onClick: async (k, c) => {
            const item = documents().items[Number(c.data)];
            if (!item) return;
            await globalThis.navigator?.clipboard?.writeText(item.name);
            k.services.tryGet(NOTIFY_SERVICE)?.notify('已复制文件名', { type: 'success', duration: 2000 });
          },
        },
        { id: 'workspace.ctx.fit', target: 'stage', group: 'view', label: '适应窗口', icon: 'fit', command: 'workspace.fit', order: 10 },
        { id: 'workspace.ctx.actual', target: 'stage', group: 'view', label: '原始大小', icon: 'actual-size', command: 'workspace.actual', order: 11 },
        { id: 'workspace.ctx.rotateLeft', target: 'stage', group: 'rotate', label: '向左旋转', icon: 'rotate-left', command: 'workspace.rotateLeft', order: 20 },
        { id: 'workspace.ctx.rotateRight', target: 'stage', group: 'rotate', label: '向右旋转', icon: 'rotate-right', command: 'workspace.rotateRight', order: 21 },
      );

      if (options.images?.length) {
        setImages(options.images).catch((error) => kernel.bus.emit('error', { error, source: WORKSPACE_PLUGIN }));
      }
    },
  });
