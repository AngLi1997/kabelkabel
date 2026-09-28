import { createServiceToken, definePlugin, ExtensionPoints, type Kernel, type PanelContribution } from '@kabel/core';
import { VIEWER_PLUGIN, ViewerExtensions } from '@kabel/plugin-viewer';
import { downloadFile } from '@kabel/ui';
import { AnnotationList } from './AnnotationList';
import { AnnotationOverlay } from './AnnotationOverlay';
import { createZip, fromDocument, toDocument, toYolo } from './export';
import { LabelBar } from './LabelBar';
import { annotationActions, annotationsSlice, createAnnotationId, createAnnotatorSlice, normalizeLabels } from './slice';
import type { AnnotationDocument, AnnotationLabel, AnnotationMap, AnnotationTool, LabelInput } from './types';

export interface AnnotationPluginOptions {
  /** 标记类型，默认一组档案要素；前九个可用数字键 1–9 切换 */
  labels?: LabelInput[];
  /** 导出文件名（不含扩展名），默认 `annotations` */
  fileName?: string | ((kernel: Kernel) => string);
  panel?: Partial<Pick<PanelContribution, 'title' | 'region' | 'order'>>;
}

export interface AnnotationService {
  getLabels(): AnnotationLabel[];
  /** 当前影像列表的全部标记（JSON 导出格式） */
  getAnnotations(): AnnotationDocument;
  /**
   * 载入标记（JSON 导出格式）。影像仍在加载时会在影像就绪后生效，
   * 因此可以在调用 setImages 之后立即调用。
   */
  setAnnotations(doc: AnnotationDocument | null): void;
  exportJson(): AnnotationDocument;
  /** YOLO 文件集合：路径 → 文本内容 */
  exportYolo(): Record<string, string>;
}

export const ANNOTATION_SERVICE = createServiceToken<AnnotationService>('kabel.annotation');
export const ANNOTATION_PLUGIN = 'kabel:annotation';

/** 影像标记：顶部标记类型、在影像上拉框标记、右侧标记列表，导出 YOLO / JSON */
export const annotationPlugin = (options: AnnotationPluginOptions = {}) =>
  definePlugin({
    name: ANNOTATION_PLUGIN,
    title: '图片标记',
    dependencies: [VIEWER_PLUGIN],
    setup(ctx) {
      const { kernel } = ctx;
      const labels = normalizeLabels(options.labels);
      const annotator = createAnnotatorSlice(labels);
      ctx.registerSlice(annotationsSlice);
      ctx.registerSlice(annotator);
      const actions = annotator.actions;
      const state = () => kernel.getState();
      const images = () => state().viewer?.images ?? [];
      const currentImage = () => {
        const v = state().viewer;
        return v?.images[v.index];
      };

      const load = (doc: AnnotationDocument | null) => {
        const parsed = doc ? fromDocument(doc, labels, createAnnotationId) : { annotations: {}, sizes: {} };
        kernel.dispatch(annotationActions.load(parsed.annotations, { history: false }));
        kernel.dispatch(actions.setSizes({ ...state().annotator.sizes, ...parsed.sizes }));
      };

      // 影像列表替换（切换档案）时清空标记；加载期间通过 setAnnotations 提交的数据在影像就绪后载入
      let pending: AnnotationDocument | null | undefined;
      ctx.watch(
        (s) => s.viewer?.images,
        () => {
          const hadAnnotations = Object.keys(state().annotations).length > 0;
          kernel.dispatch(actions.setSizes({}));
          load(pending ?? null);
          pending = undefined;
          // 旧档案的标记不应再能通过撤销恢复
          if (hadAnnotations) kernel.history.clear();
        },
      );
      ctx.watch(
        (s) => s.annotations,
        (annotations) => kernel.bus.emit('annotation:change', { annotations }),
      );
      // 切换页面时取消选中
      ctx.watch(
        (s) => s.viewer?.index,
        () => kernel.dispatch(actions.select(null)),
      );

      const service: AnnotationService = {
        getLabels: () => labels,
        getAnnotations: () => toDocument(state().annotations, labels, images(), state().annotator.sizes),
        setAnnotations: (doc) => {
          if (state().viewer?.loading) pending = doc;
          else load(doc);
        },
        exportJson: () => service.getAnnotations(),
        exportYolo: () => toYolo(state().annotations, labels, images(), state().annotator.sizes),
      };
      ctx.provide(ANNOTATION_SERVICE, service);

      const fileName = () =>
        (typeof options.fileName === 'function' ? options.fileName(kernel) : options.fileName) || 'annotations';
      const hasAnnotations = () => Object.keys(state().annotations).length > 0;
      const selectedBox = () => {
        const { selected } = state().annotator;
        const image = currentImage();
        return selected && image ? state().annotations[image.id]?.find((a) => a.id === selected) : undefined;
      };

      /** 切换当前标记类型；若有选中的标记，同时修改其类型 */
      const setLabel = (id: string) => {
        const label = labels.find((l) => l.id === id);
        if (!label) return;
        kernel.dispatch(actions.setActive(id));
        const box = selectedBox();
        if (box && box.label !== id) {
          kernel.dispatch(
            annotationActions.update(
              { imageId: currentImage()!.id, id: box.id, patch: { label: id } },
              { history: { label: `修改标记类型为「${label.name}」` } },
            ),
          );
        }
      };

      ctx.registerCommand({ id: 'annotation.setLabel', title: '切换标记类型', run: (_k, id: string) => setLabel(id) });
      labels.slice(0, 9).forEach((label, i) => {
        ctx.registerCommand({
          id: `annotation.label.${i + 1}`,
          title: `标记类型：${label.name}`,
          keybinding: String(i + 1),
          run: () => setLabel(label.id),
        });
      });
      const toolCommand = (tool: AnnotationTool, title: string, keybinding: string) =>
        ctx.registerCommand({
          id: `annotation.tool.${tool}`,
          title,
          keybinding,
          checked: (k) => k.getState().annotator.tool === tool,
          run: (k) => k.dispatch(actions.setTool(tool)),
        });
      toolCommand('draw', '框选标记', 'R');
      toolCommand('pan', '拖动', 'H');
      ctx.registerCommand({
        id: 'annotation.delete',
        title: '删除选中标记',
        keybinding: ['Delete', 'Backspace'],
        enabled: () => !!selectedBox(),
        run: (k) => {
          const box = selectedBox();
          if (!box) return;
          k.dispatch(annotationActions.remove({ imageId: currentImage()!.id, id: box.id }, { history: { label: '删除标记' } }));
          k.dispatch(actions.select(null));
        },
      });
      ctx.registerCommand({
        id: 'annotation.deselect',
        title: '取消选中',
        keybinding: 'Escape',
        enabled: (k) => k.getState().annotator.selected !== null,
        run: (k) => k.dispatch(actions.select(null)),
      });
      ctx.registerCommand({
        id: 'annotation.exportJson',
        title: '导出 JSON',
        enabled: hasAnnotations,
        run: () => downloadFile(`${fileName()}.json`, JSON.stringify(service.exportJson(), null, 2), 'application/json'),
      });
      ctx.registerCommand({
        id: 'annotation.exportYolo',
        title: '导出 YOLO',
        enabled: hasAnnotations,
        run: () => downloadFile(`${fileName()}-yolo.zip`, createZip(service.exportYolo()), 'application/zip'),
      });

      ctx.contribute(
        ExtensionPoints.toolbar,
        { id: 'annotation.separator', type: 'separator', order: 59 },
        { id: 'annotation.labels', type: 'view', view: LabelBar, order: 60 },
      );
      ctx.contribute(
        ViewerExtensions.tools,
        { id: 'annotation.draw', icon: 'box', tooltip: '框选标记 (R)', command: 'annotation.tool.draw', order: 10 },
        { id: 'annotation.pan', icon: 'hand', tooltip: '拖动 (H，或按住空格)', command: 'annotation.tool.pan', order: 20 },
      );
      ctx.contribute(ViewerExtensions.overlays, { id: 'annotation.overlay', view: AnnotationOverlay });
      ctx.contribute(ExtensionPoints.panels, {
        id: 'annotation.list',
        region: options.panel?.region ?? 'right',
        title: options.panel?.title ?? '标记',
        order: options.panel?.order ?? 10,
        view: AnnotationList,
      });
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'annotation.count',
        align: 'right',
        order: 5,
        icon: 'box',
        text: (s) => {
          const map: AnnotationMap | undefined = s.annotations;
          if (!map) return null;
          const total = Object.values(map).reduce((n, list) => n + list.length, 0);
          return total ? `标记 ${total}` : null;
        },
      });
    },
  });
