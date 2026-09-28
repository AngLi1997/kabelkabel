import { defineExtensionPoint, type Kernel, type View } from '@kabel/core';
import type { ImageItem } from './sources';

export interface Point {
  x: number;
  y: number;
}

/** 覆盖层属性：坐标换算基于当前缩放、旋转与平移 */
export interface ViewerOverlayProps {
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
}

/**
 * 影像覆盖层：铺满舞台、位于图片之上，默认不拦截指针事件（需要交互的元素自行设置 pointer-events）。
 * 覆盖层未处理的指针事件冒泡到舞台，由查看器处理拖动平移。
 */
export interface ViewerOverlay {
  id: string;
  order?: number;
  view: View<ViewerOverlayProps>;
}

/** 影像侧边工具条中的按钮；选中态取自命令的 checked */
export interface ViewerTool {
  id: string;
  order?: number;
  icon: string;
  tooltip: string;
  command: string;
  args?: unknown[];
}

export const ViewerExtensions = {
  overlays: defineExtensionPoint<ViewerOverlay>('kabel.viewer.overlays'),
  tools: defineExtensionPoint<ViewerTool>('kabel.viewer.tools'),
} as const;
