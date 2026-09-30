import { definePlugin, ExtensionPoints, NOTIFY_SERVICE, type Disposable, type PluginContext } from '@kabel/core';
import { WORKSPACE_PLUGIN, WORKSPACE_SERVICE, WorkspaceExtensions, type ImageItem } from '@kabel/plugin-workspace';
import {
  REGION_CROPPER,
  REGION_SELECT_PLUGIN,
  REGION_SERVICE,
  REGION_TOOL_ID,
  RegionExtensions,
  type Bounds,
  type CropOptions,
  type PickOptions,
  type RegionCrop,
  type RegionSelection,
  type RegionService,
  type RegionShape,
  type RegionShapeType,
  type ShapeDefinition,
  type ShapeTool,
} from './contract';
import { createCanvasCropper } from './cropper';
import { snapBBox } from './geometry';
import { RegionOverlay, type OverlayController } from './overlay';
import { createResultList } from './results';
import { ResultsPanel } from './ResultsPanel';
import { regionSelectActions, regionSelectSlice } from './slice';
import { builtinShapes } from './shapes';

export interface RegionSelectOptions {
  /** 小于该尺寸（图片像素）的选区视为误触，默认 4 */
  minSize?: number;
  /** 框选完成后自动退出工具，默认 true */
  autoExit?: boolean;
  /** 启用的内置形状，默认 `['rect', 'polygon']` */
  shapes?: RegionShapeType[];
  /** 默认裁剪参数（输出格式、质量） */
  crop?: CropOptions;
  /** 右侧“框选结果”面板（列出最近的用户框选）；`false` 不注册 */
  panel?: { region?: 'left' | 'right'; title?: string; order?: number; limit?: number } | false;
}

/**
 * 贡献一种形状：注册形状定义，并生成切换命令 `regionSelect.tool.<type>` 与舞台侧边工具条按钮。
 * 内置的矩形、多边形与第三方新增形状（圆形、点位、线条…）都走这一个入口；
 * 注册挂在调用方插件的 `ctx` 上，插件卸载时随之释放。
 */
export function contributeShape<K extends RegionShapeType>(ctx: PluginContext, def: ShapeDefinition<K>): void {
  const command = `regionSelect.tool.${def.type}`;
  ctx.contribute(RegionExtensions.shapes, { ...(def as unknown as ShapeDefinition), id: def.type });
  ctx.registerCommand({
    id: command,
    title: def.title,
    icon: def.icon,
    enabled: (k) => k.services.tryGet(WORKSPACE_SERVICE)?.current()?.kind === 'image' && k.services.has(REGION_SERVICE),
    checked: (k) => k.getState().regionSelect?.tool === def.type,
    run: (k) => {
      const region = k.services.get(REGION_SERVICE);
      if (region.activeShape() === def.type) region.deactivate();
      else region.activate(def.type);
    },
  });
  ctx.contribute(WorkspaceExtensions.tools, { id: `regionSelect.${def.type}`, order: 100 + (def.order ?? 0), icon: def.icon, tooltip: def.title, command });
}

interface Session {
  shape: RegionShapeType;
  tool: ShapeTool;
  origin: string;
  bounds: Bounds | null;
  resolve?: (selection: RegionSelection | null) => void;
}

let counter = 0;

/**
 * 框选：在影像舞台上框选区域，把原始图片与裁剪图通过事件交给下游。
 *
 * - **交互**：占用舞台工具（`acquireTool`），左键绘制；平移改为 空格 + 左键，Shift + 左键约束正方形；
 * - **形状**：矩形、多边形内置，其他形状通过 `contributeShape` 扩展；
 * - **结果**：事件 `region:select`（原图 Blob、裁剪图 Blob、bbox、形状），下游自行决定保存 / OCR / 入列表；
 * - **服务**：`REGION_SERVICE`（`pick` 请求一次框选、`crop` 无 UI 裁剪）与可替换的 `REGION_CROPPER`。
 */
export const regionSelectPlugin = (options: RegionSelectOptions = {}) =>
  definePlugin({
    name: REGION_SELECT_PLUGIN,
    title: '框选',
    dependencies: [WORKSPACE_PLUGIN],
    setup(ctx) {
      const { kernel } = ctx;
      const minSize = options.minSize ?? 4;
      const autoExit = options.autoExit ?? true;
      const enabledShapes = options.shapes ?? ['rect', 'polygon'];
      const workspace = () => kernel.services.get(WORKSPACE_SERVICE);
      const shapes = () => kernel.extensions.get(RegionExtensions.shapes);
      const notify = (message: string, type: 'warning' | 'error' = 'warning') => kernel.services.tryGet(NOTIFY_SERVICE)?.notify(message, { type });
      let disposed = false;
      ctx.onDispose(() => {
        disposed = true;
        endSession('cancel');
      });

      ctx.registerSlice(regionSelectSlice);
      ctx.provide(REGION_CROPPER, createCanvasCropper());
      const cropper = () => kernel.services.get(REGION_CROPPER);

      // ---------- 生成裁剪结果 ----------
      const produce = async (image: ImageItem, shape: RegionShape, bounds: Bounds | null, cropOptions?: CropOptions) => {
        const def = shapes().get(shape.type);
        if (!def) throw new Error(`未注册的形状类型：${shape.type}`);
        const provider = cropper();
        const original = await provider.original(image);
        if (def.crop === false) return { original, bbox: def.bbox(shape), crop: null };
        const bbox = snapBBox(def.bbox(shape), bounds ?? { width: Infinity, height: Infinity });
        const cropped = await provider.crop({
          image,
          bbox,
          mode: def.crop,
          clip: def.crop === 'clip' ? (path) => def.clipPath!(shape, path, { x: bbox.x, y: bbox.y }) : undefined,
          options: { ...options.crop, ...cropOptions },
        });
        const crop: RegionCrop = { ...cropped, bbox, localShape: def.translate(shape, bbox.x, bbox.y) };
        return { original, bbox, crop };
      };

      // ---------- 会话：一次激活 = 一个形状状态机 ----------
      let session: Session | null = null;
      let lease: Disposable | null = null;

      function endSession(reason: 'cancel' | 'preempted' | false, keepLease = false) {
        const s = session;
        session = null;
        if (!s) return;
        s.tool.reset();
        if (!keepLease) {
          lease?.dispose();
          lease = null;
        }
        kernel.dispatch(regionSelectActions.deactivate());
        s.resolve?.(null);
        if (reason) ctx.bus.emit('region:cancel', { origin: s.origin, reason });
      }

      const activate = (type: RegionShapeType, origin = 'user', resolve?: Session['resolve']) => {
        const def = shapes().get(type);
        if (!def) {
          notify(`未注册的框选形状：${type}`);
          resolve?.(null);
          return;
        }
        // 新激活取代旧会话，保留工作台租约避免 tool-change 抖动
        endSession('cancel', true);
        lease ??= workspace().acquireTool(REGION_TOOL_ID, { cursor: 'crosshair' });
        const next: Session = { shape: type, origin, bounds: null, resolve } as Session;
        next.tool = def.createTool({
          minSize,
          change: (draft) => {
            kernel.dispatch(regionSelectActions.setDraft(draft));
            ctx.bus.emit('region:change', { draft });
          },
          commit: (shape) => submit(next, shape),
        });
        session = next;
        kernel.dispatch(regionSelectActions.activate(type));
      };

      // 别的工具抢占舞台：退出
      ctx.on('stage:tool-change', ({ active }) => {
        if (session && active !== REGION_TOOL_ID) {
          lease = null;
          endSession('preempted');
        }
      });
      // 切换文件：丢弃未完成的草稿，工具保持激活
      ctx.on('document:change', () => session?.tool.reset());

      /** 工具提交形状：同步校验（失败返回 false 保留草稿），通过后异步裁剪并广播 */
      function submit(s: Session, shape: RegionShape): boolean {
        const document = workspace().current();
        if (!document || document.kind !== 'image') return false;
        const def = shapes().get(shape.type);
        if (!def) return false;
        const problem = def.validate?.(shape, { minSize, bounds: s.bounds ?? { width: Infinity, height: Infinity } });
        if (problem) {
          notify(problem);
          return false;
        }
        void finish(s, document as ImageItem, shape);
        return true;
      }

      async function finish(s: Session, image: ImageItem, shape: RegionShape) {
        const def = shapes().get(shape.type)!;
        const bbox = def.bbox(shape);
        const { origin } = s;
        const resolve = s.resolve;
        try {
          await ctx.bus.emitAsync('region:before-select', { origin, document: image, shape, bbox });
        } catch (error) {
          ctx.bus.emit('region:cancel', { origin, reason: 'rejected', error });
          if (resolve) endSession(false);
          return;
        }
        if (disposed) return;
        kernel.dispatch(regionSelectActions.setBusy(true));
        try {
          const result = await produce(image, shape, s.bounds, undefined);
          if (disposed) return;
          const selection: RegionSelection = {
            id: `region-${Date.now().toString(36)}-${++counter}`,
            origin,
            document: image,
            image,
            original: result.original,
            shape,
            bbox: result.crop?.bbox ?? result.bbox,
            crop: result.crop,
          };
          kernel.dispatch(regionSelectActions.setLast({ id: selection.id, documentId: image.id, shape, bbox: selection.bbox }));
          ctx.bus.emit('region:select', selection);
          resolve?.(selection);
          // pick 一次性；用户来源按 autoExit 决定
          if (resolve || autoExit) {
            if (session === s) {
              s.resolve = undefined;
              endSession(false);
            }
          }
        } catch (error) {
          ctx.bus.emit('region:error', { origin, error });
          notify(`框选失败：${error instanceof Error ? error.message : String(error)}`, 'error');
          resolve?.(null);
          if (session === s) {
            s.resolve = undefined;
            if (resolve) endSession(false);
          }
        } finally {
          if (!disposed) kernel.dispatch(regionSelectActions.setBusy(false));
        }
      }

      // ---------- 服务 ----------
      const service: RegionService = {
        pick: (pick: PickOptions) => new Promise((resolve) => activate(pick.shape ?? 'rect', pick.origin, resolve)),
        crop: async (image, shape, cropOptions) => (await produce(image, shape, null, cropOptions)).crop,
        activeShape: () => session?.shape ?? null,
        activate: (type) => activate(type),
        deactivate: () => endSession('cancel'),
      };
      ctx.provide(REGION_SERVICE, service);

      // ---------- 覆盖层与命令 ----------
      const controller: OverlayController = {
        pointer(kind, event) {
          const s = session;
          if (!s) return;
          s.bounds = event.bounds;
          if (kind === 'down') s.tool.down(event);
          else if (kind === 'move') s.tool.move(event);
          else if (kind === 'up') s.tool.up(event);
          else if (kind === 'dblclick') s.tool.doubleClick?.(event);
          else s.tool.secondary?.(event);
        },
      };
      ctx.contribute(WorkspaceExtensions.overlays, {
        id: 'regionSelect.overlay',
        order: 100,
        tool: REGION_TOOL_ID,
        view: (props) => <RegionOverlay {...props} controller={controller} />,
      });

      if (options.panel !== false) {
        const results = createResultList(options.panel?.limit ?? 20);
        ctx.onDispose(() => results.clear());
        // 只收用户手动框选的；pick() 的结果由请求方自己处理
        ctx.on('region:select', (selection) => {
          if (selection.origin === 'user') results.add(selection);
        });
        ctx.contribute(ExtensionPoints.panels, {
          id: 'regionSelect.results',
          region: options.panel?.region ?? 'right',
          title: options.panel?.title ?? '框选结果',
          icon: 'box',
          order: options.panel?.order ?? 50,
          view: () => <ResultsPanel results={results} />,
        });
      }

      for (const def of builtinShapes) if (enabledShapes.includes(def.type)) contributeShape(ctx, def);

      ctx.registerCommand({
        id: 'regionSelect.cancel',
        title: '取消框选',
        keybinding: 'Escape',
        enabled: () => !!session,
        // 有草稿先丢弃草稿，没有再退出工具
        run: () => {
          if (session && !session.tool.reset()) endSession('cancel');
        },
      });
      ctx.registerCommand({
        id: 'regionSelect.confirm',
        title: '完成框选',
        keybinding: 'Enter',
        enabled: () => !!session?.tool.canFinish(),
        run: () => void session?.tool.finish(),
      });
      ctx.registerCommand({
        id: 'regionSelect.undo',
        title: '撤销上一步（框选）',
        keybinding: 'Backspace',
        enabled: (k) => !!session && !!k.getState().regionSelect.draft,
        run: () => void session?.tool.undo?.(),
      });
    },
  });
