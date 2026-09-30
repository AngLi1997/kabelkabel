import { defineExtensionPoint, type Kernel, type View } from '@kabel/core';
import type { DocumentItem } from './documents/types';
import type { ImageItem } from './sources';

export interface Point {
  x: number;
  y: number;
}

/** 覆盖层属性：坐标换算基于当前缩放、旋转与平移（当前舞台为影像舞台） */
export interface StageOverlayProps {
  kernel: Kernel;
  image: ImageItem;
  /** 图片原始尺寸（像素） */
  width: number;
  height: number;
  scale: number;
  rotation: number;
  /** 图片像素坐标 → 舞台坐标（相对舞台左上角） */
  toScreen(x: number, y: number): Point;
  /** 舞台坐标 → 图片像素坐标（可能超出图片范围） */
  toImage(x: number, y: number): Point;
  /** 本覆盖层所属工具（`StageOverlay.tool`）是否为当前占用舞台的工具 */
  interactive: boolean;
}

/**
 * 影像覆盖层：铺满舞台、位于图片之上，默认不拦截指针事件（需要交互的元素自行设置 pointer-events）。
 * 覆盖层未处理的指针事件冒泡到舞台，由舞台处理拖动平移。
 */
export interface StageOverlay {
  id: string;
  order?: number;
  /**
   * 所属交互工具 id（与 `WorkspaceService.acquireTool` 的 id 一致）。
   * 只有该工具当前占用舞台时，覆盖层才接收指针事件；未声明则始终不拦截。
   */
  tool?: string;
  view: View<StageOverlayProps>;
}

/** 舞台侧边工具条中的按钮；选中态取自命令的 checked */
export interface StageTool {
  id: string;
  order?: number;
  icon: string;
  tooltip: string;
  command: string;
  args?: unknown[];
}

export interface DocumentRendererProps {
  kernel: Kernel;
  document: DocumentItem;
}

/**
 * 文件渲染器：内容面板按当前文件的 `kind` 选择第一个 `match` 的渲染器（按 order 升序）。
 * 内置 `workspace.image`（kind 为 image）；PDF、OFD 等类型通过贡献新的渲染器接入。
 */
export interface DocumentRenderer {
  id: string;
  order?: number;
  match(document: DocumentItem): boolean;
  view: View<DocumentRendererProps>;
}

/** 工作台的扩展点：业务插件通过它们向内容区域贡献渲染器、覆盖层与工具 */
export const WorkspaceExtensions = {
  /** 文件渲染器 */
  renderers: defineExtensionPoint<DocumentRenderer>('kabel.workspace.renderers'),
  /** 影像舞台上的覆盖层（标注、水印、选区…） */
  overlays: defineExtensionPoint<StageOverlay>('kabel.workspace.overlays'),
  /** 影像舞台侧边工具条按钮 */
  tools: defineExtensionPoint<StageTool>('kabel.workspace.tools'),
} as const;
