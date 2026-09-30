import type { Point } from '@kabel/plugin-workspace';
import type { Bounds, RegionBBox } from './contract';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 限制在图片范围 [0, width] × [0, height] 内 */
export const clampPoint = (p: Point, bounds: Bounds): Point => ({
  x: clamp(p.x, 0, bounds.width),
  y: clamp(p.y, 0, bounds.height),
});

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 由对角两点得到规范化矩形 */
export function rectFromPoints(a: Point, b: Point): RegionBBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** 从锚点向 `to` 拖出正方形：边长取两个方向中较大者，并保证不越出图片 */
export function squareFrom(anchor: Point, to: Point, bounds: Bounds): Point {
  const dx = to.x - anchor.x;
  const dy = to.y - anchor.y;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const room = Math.min(sx > 0 ? bounds.width - anchor.x : anchor.x, sy > 0 ? bounds.height - anchor.y : anchor.y);
  const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), room);
  return { x: anchor.x + sx * side, y: anchor.y + sy * side };
}

export function bboxOfPoints(points: readonly Point[]): RegionBBox {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 向外取整并限制在图片范围内，保证裁剪不丢失边缘像素 */
export function snapBBox(bbox: RegionBBox, bounds: Bounds): RegionBBox {
  const x = clamp(Math.floor(bbox.x), 0, bounds.width);
  const y = clamp(Math.floor(bbox.y), 0, bounds.height);
  const right = clamp(Math.ceil(bbox.x + bbox.width), 0, bounds.width);
  const bottom = clamp(Math.ceil(bbox.y + bbox.height), 0, bounds.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** 多边形面积（鞋带公式，取绝对值） */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);

/** 线段 ab 与 cd 是否相交（含端点接触） */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
}

/** 多边形是否自交：任意两条不相邻的边不得相交 */
export function isSimplePolygon(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // 相邻的边共用顶点，跳过
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, points[j]!, points[(j + 1) % n]!)) return false;
    }
  }
  return true;
}
