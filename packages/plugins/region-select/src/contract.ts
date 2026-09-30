import { createServiceToken, defineExtensionPoint } from '@kabel/core';
import type { DocumentItem, ImageItem, Point } from '@kabel/plugin-workspace';
import type { ComponentChild } from 'preact';

/**
 * 框选的对外契约：下游插件只需要这里的令牌、类型与事件，不必依赖绘制和裁剪的实现。
 * 形状与事件都是可扩展的（声明合并 / 扩展点）。
 */

// ---------- 形状 ----------

/**
 * 形状表：键为形状类型，值为该形状的数据（图片像素坐标）。新增形状时用声明合并追加：
 *
 * ```ts
 * declare module '@kabel/plugin-region-select' {
 *   interface RegionShapeMap { circle: { cx: number; cy: number; r: number } }
 * }
 * ```
 */
export interface RegionShapeMap {
  rect: { x: number; y: number; width: number; height: number };
  polygon: { points: Point[] };
}

export type RegionShapeType = keyof RegionShapeMap;
export type RegionShape<K extends RegionShapeType = RegionShapeType> = {
  [T in K]: { type: T } & RegionShapeMap[T];
}[K];

export interface RegionBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  width: number;
  height: number;
}

// ---------- 形状扩展点 ----------

/** 交互工具收到的指针事件，坐标均为图片像素坐标 */
export interface ToolPointerEvent {
  /** 限制在图片范围内的坐标 */
  point: Point;
  /** 未限制的坐标（可超出图片） */
  raw: Point;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  /** 当前缩放比例，用于把屏幕像素容差换算为图片像素 */
  scale: number;
  bounds: Bounds;
}

/** 工具向框选插件回报草稿与最终形状 */
export interface ToolHost<S = RegionShape> {
  /** 小于该尺寸（图片像素）的选区视为误触 */
  minSize: number;
  /** 草稿变化；`null` 清除草稿 */
  change(draft: S | null): void;
  /** 提交形状。返回 false 表示被拒绝（校验失败），工具应保留草稿让用户修改 */
  commit(shape: S): boolean;
}

/** 一次绘制过程的状态机；每次激活形状时创建一个实例 */
export interface ShapeTool {
  down(event: ToolPointerEvent): void;
  move(event: ToolPointerEvent): void;
  up(event: ToolPointerEvent): void;
  doubleClick?(event: ToolPointerEvent): void;
  /** 右键 */
  secondary?(event: ToolPointerEvent): void;
  /** 是否有可以提交的草稿（决定 Enter 是否可用） */
  canFinish(): boolean;
  /** 提交当前草稿（Enter / 命令） */
  finish(): boolean;
  /** 撤销最近一步（如多边形的上一个顶点） */
  undo?(): boolean;
  /** 丢弃草稿，返回此前是否存在草稿 */
  reset(): boolean;
}

/** 与 canvas 路径 API 兼容的最小子集，便于在测试中替换 */
export interface PathBuilder {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  closePath(): void;
}

export interface ShapeRenderProps {
  /** 图片像素 → 舞台坐标（已考虑缩放、旋转与平移） */
  toScreen(x: number, y: number): Point;
  scale: number;
  /** 是否为绘制中的草稿 */
  draft: boolean;
}

/**
 * 形状定义：矩形、多边形是本插件自带的两份；圆形、点位、线条等以后通过 `contributeShape`
 * 增加，无需修改覆盖层、事件与裁剪流程。同 `type` 贡献即替换。
 */
export interface ShapeDefinition<K extends RegionShapeType = RegionShapeType> {
  type: K;
  title: string;
  icon: string;
  order?: number;
  /** 创建一次绘制的状态机 */
  createTool(host: ToolHost<RegionShape<K>>): ShapeTool;
  /** 外接矩形（图片像素） */
  bbox(shape: RegionShape<K>): RegionBBox;
  /** 平移形状，用于换算相对裁剪图的 `localShape` */
  translate(shape: RegionShape<K>, dx: number, dy: number): RegionShape<K>;
  /**
   * 裁剪方式：`bbox` 按外接矩形裁；`clip` 按 `clipPath` 裁剪，形状外透明；
   * `false` 表示没有面积（点位、线条），只返回形状而不产生裁剪图。
   */
  crop: 'bbox' | 'clip' | false;
  /** `crop` 为 `clip` 时必填：把形状写入路径，坐标已减去偏移量（相对裁剪图） */
  clipPath?(shape: RegionShape<K>, path: PathBuilder, offset: Point): void;
  /** 校验，返回错误提示；通过返回 null */
  validate?(shape: RegionShape<K>, options: { minSize: number; bounds: Bounds }): string | null;
  /** 绘制（返回 SVG 元素，坐标为舞台坐标） */
  render(shape: RegionShape<K>, props: ShapeRenderProps): ComponentChild;
}

/** 形状扩展点；贡献项 id 即形状类型 */
export type ShapeContribution = ShapeDefinition & { id: string };

export const RegionExtensions = {
  shapes: defineExtensionPoint<ShapeContribution>('kabel.regionSelect.shapes'),
} as const;

// ---------- 裁剪器（可替换的 Provider） ----------

export interface CropOptions {
  /** 输出格式，默认 `image/png`（形状外透明需要 PNG / WebP） */
  mime?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  /** 输出为 JPEG 时用于填充形状外区域的颜色，默认白色 */
  background?: string;
}

export interface CropRequest {
  image: ImageItem;
  /** 已取整并限制在图片范围内 */
  bbox: RegionBBox;
  mode: 'bbox' | 'clip';
  /** `mode` 为 `clip` 时把形状写入路径（坐标相对裁剪图） */
  clip?: (path: PathBuilder) => void;
  options: CropOptions;
}

export interface CropImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

/**
 * 裁剪器：默认使用 canvas 实现。宿主可以 `provide(REGION_CROPPER, ...)` 换成服务端裁剪、
 * WASM 等（服务是覆盖栈，后提供者生效）。
 */
export interface RegionCropper {
  /** 取得原始图片的 Blob */
  original(image: ImageItem): Promise<Blob>;
  crop(request: CropRequest): Promise<CropImage>;
}

export const REGION_CROPPER = createServiceToken<RegionCropper>('kabel.regionSelect.cropper');

// ---------- 结果与事件 ----------

export interface RegionCrop extends CropImage {
  /** 外接矩形（图片像素，已取整） */
  bbox: RegionBBox;
  /** 相对裁剪图左上角的形状，便于下游继续标注 */
  localShape: RegionShape;
}

/** 一次框选的结果：原始图片与裁剪图都已就绪 */
export interface RegionSelection<S extends RegionShape = RegionShape> {
  id: string;
  /** 发起者：用户点工具条为 `user`，`pick()` 为请求方传入的名字 */
  origin: string;
  document: DocumentItem;
  image: ImageItem;
  /** 原始图片 */
  original: Blob;
  /** 图片像素坐标 */
  shape: S;
  bbox: RegionBBox;
  /** 无面积的形状（点位、线条）为 null */
  crop: RegionCrop | null;
}

export interface RegionPending {
  origin: string;
  document: DocumentItem;
  shape: RegionShape;
  bbox: RegionBBox;
}

declare module '@kabel/core' {
  interface KabelEvents {
    /**
     * 提交前校验：处理器 reject 即否决本次选区（可用于业务上的最小面积、范围限制）。
     * @mode emitAsync
     */
    'region:before-select': RegionPending;
    /**
     * 框选完成，原始图片与裁剪图已就绪。下游决定如何使用（保存、OCR、加入列表…）。
     * @mode emit
     */
    'region:select': RegionSelection;
    /**
     * 绘制中的草稿，`null` 表示草稿被清除。
     * @mode emit
     */
    'region:change': { draft: RegionShape | null };
    /**
     * 取消（Esc、切换工具、被抢占、被 before-select 否决）。
     * @mode emit
     */
    'region:cancel': { origin: string; reason: 'cancel' | 'preempted' | 'rejected'; error?: unknown };
    /**
     * 解码或裁剪失败（如跨域图片污染 canvas），此时不会触发 `region:select`。
     * @mode emit
     */
    'region:error': { origin: string; error: unknown };
  }
}

// ---------- 服务 ----------

export interface PickOptions {
  /** 请求方标识，会出现在事件的 `origin` 上，便于下游区分 */
  origin: string;
  /** 形状类型，默认 `rect` */
  shape?: RegionShapeType;
}

export interface RegionService {
  /** 发起一次框选，确认时返回结果，取消或被抢占返回 null；同一时刻只有一个请求 */
  pick(options: PickOptions): Promise<RegionSelection | null>;
  /** 无 UI 的裁剪：对已有形状（如标注插件中的某个框）直接取裁剪图 */
  crop(image: ImageItem, shape: RegionShape, options?: CropOptions): Promise<RegionCrop | null>;
  /** 当前激活的形状类型 */
  activeShape(): RegionShapeType | null;
  /** 激活 / 退出框选（用户来源） */
  activate(shape: RegionShapeType): void;
  deactivate(): void;
}

export const REGION_SERVICE = createServiceToken<RegionService>('kabel.regionSelect');
export const REGION_SELECT_PLUGIN = 'kabel:region-select';
/** 框选在工作台注册的工具 id，也是覆盖层的 `tool` */
export const REGION_TOOL_ID = 'kabel:region-select';
