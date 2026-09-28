import { createServiceToken, definePlugin, ExtensionPoints, isPromiseLike, type PanelContribution } from '@kabel/core';
import { currentScale, viewerActions, viewerSlice, ZOOM_STEP } from './slice';
import { browserUrlFactory, resolveImage, type ImageItem, type ImageSourceInput, type UrlFactory } from './sources';
import { ViewerPanel } from './ViewerPanel';

export interface ViewerService {
  /** 设置影像列表；包含异步加载器时返回的 Promise 在全部加载后完成 */
  setImages(inputs: readonly ImageSourceInput[]): Promise<void>;
  getImages(): ImageItem[];
  current(): ImageItem | undefined;
  goto(index: number): void;
}

export const VIEWER_SERVICE = createServiceToken<ViewerService>('kabel.viewer');

export interface ViewerPluginOptions {
  images?: readonly ImageSourceInput[];
  /** 默认是否显示缩略图条 */
  thumbnails?: boolean;
  panel?: Partial<Pick<PanelContribution, 'title' | 'region' | 'order'>>;
  /** 自定义 object URL 管理（测试或 SSR 场景） */
  urlFactory?: UrlFactory;
}

export const VIEWER_PLUGIN = 'kabel:viewer';

export const viewerPlugin = (options: ViewerPluginOptions = {}) =>
  definePlugin({
    name: VIEWER_PLUGIN,
    setup(ctx) {
      const { kernel } = ctx;
      const urls = options.urlFactory ?? browserUrlFactory;
      const prefs = ctx.storage.get<{ thumbnails?: boolean; thumbSize?: number }>('prefs', {});
      ctx.registerSlice(viewerSlice, {
        ...viewerSlice.getInitialState(),
        thumbnails: prefs.thumbnails ?? options.thumbnails ?? true,
        thumbSize: prefs.thumbSize ?? 88,
      });
      ctx.watch(
        (s) => (s.viewer ? `${s.viewer.thumbnails}|${s.viewer.thumbSize}` : ''),
        () => {
          const { thumbnails, thumbSize } = kernel.getState().viewer;
          ctx.storage.set('prefs', { thumbnails, thumbSize });
        },
      );

      let owned: string[] = [];
      let generation = 0;
      const release = () => {
        owned.forEach((u) => urls.revoke(u));
        owned = [];
      };
      ctx.onDispose(release);

      const setImages = async (inputs: readonly ImageSourceInput[]) => {
        const current = ++generation;
        kernel.dispatch(viewerActions.setLoading(true));
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
          kernel.dispatch(viewerActions.setImages(resolved.map((r) => r.item)));
        } finally {
          if (current === generation) kernel.dispatch(viewerActions.setLoading(false));
        }
      };

      const service: ViewerService = {
        setImages,
        getImages: () => kernel.getState().viewer.images,
        current: () => {
          const { images, index } = kernel.getState().viewer;
          return images[index];
        },
        goto: (index) => kernel.dispatch(viewerActions.goto(index)),
      };
      ctx.provide(VIEWER_SERVICE, service);

      ctx.watch(
        (s) => (s.viewer ? s.viewer.images[s.viewer.index] : undefined),
        (image) => kernel.bus.emit('viewer:change', { index: kernel.getState().viewer.index, image }),
      );

      const has = () => kernel.getState().viewer.images.length > 0;
      const commands: [string, string, () => void, (() => boolean)?][] = [
        ['viewer.prev', '上一页', () => kernel.dispatch(viewerActions.prev()), () => kernel.getState().viewer.index > 0],
        ['viewer.next', '下一页', () => kernel.dispatch(viewerActions.next()), () => {
          const v = kernel.getState().viewer;
          return v.index < v.images.length - 1;
        }],
        ['viewer.zoomIn', '放大', () => kernel.dispatch(viewerActions.zoomBy(ZOOM_STEP)), has],
        ['viewer.zoomOut', '缩小', () => kernel.dispatch(viewerActions.zoomBy(1 / ZOOM_STEP)), has],
        ['viewer.fit', '适应窗口', () => kernel.dispatch(viewerActions.setZoom('fit')), has],
        ['viewer.actual', '原始大小', () => kernel.dispatch(viewerActions.setZoom(1)), has],
        ['viewer.rotateLeft', '向左旋转', () => kernel.dispatch(viewerActions.rotate(-90)), has],
        ['viewer.rotateRight', '向右旋转', () => kernel.dispatch(viewerActions.rotate(90)), has],
        ['viewer.toggleThumbnails', '缩略图', () => kernel.dispatch(viewerActions.toggleThumbnails())],
      ];
      for (const [id, title, run, enabled] of commands) {
        ctx.registerCommand({ id, title, run, enabled: enabled && (() => enabled()) });
      }
      ctx.registerCommand({ id: 'viewer.goto', title: '跳转', run: (_k, index: number) => service.goto(index) });

      ctx.contribute(ExtensionPoints.panels, {
        id: 'viewer.images',
        region: options.panel?.region ?? 'left',
        title: options.panel?.title ?? '原文影像',
        order: options.panel?.order ?? 10,
        view: ViewerPanel,
      });

      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'viewer.status',
        align: 'right',
        order: 10,
        icon: 'image',
        text: (s) => {
          const v = s.viewer;
          if (!v?.images.length) return null;
          return `第 ${v.index + 1}/${v.images.length} 页 · ${Math.round(currentScale(v) * 100)}%`;
        },
      });

      if (options.images?.length) {
        setImages(options.images).catch((error) => kernel.bus.emit('error', { error, source: VIEWER_PLUGIN }));
      }
    },
  });
