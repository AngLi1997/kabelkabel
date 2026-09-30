import type { Point } from '@kabel/plugin-workspace';
import type { RegionShape, ShapeDefinition, ShapeRenderProps, ShapeTool, ToolHost } from './contract';
import { bboxOfPoints, distance, isSimplePolygon, polygonArea, rectFromPoints, squareFrom } from './geometry';

/** 屏幕像素容差：点击起点闭合多边形 */
const CLOSE_TOLERANCE = 8;

const svgPoints = (points: readonly Point[], toScreen: ShapeRenderProps['toScreen']) =>
  points.map((p) => {
    const s = toScreen(p.x, p.y);
    return `${s.x},${s.y}`;
  });

// ---------- 矩形 ----------

function createRectTool(host: ToolHost<RegionShape<'rect'>>): ShapeTool {
  let anchor: Point | null = null;
  const build = (anchorPoint: Point, event: { point: Point; shiftKey: boolean; bounds: { width: number; height: number } }): RegionShape<'rect'> => {
    // Shift 约束为正方形
    const end = event.shiftKey ? squareFrom(anchorPoint, event.point, event.bounds) : event.point;
    return { type: 'rect', ...rectFromPoints(anchorPoint, end) };
  };
  return {
    down(event) {
      if (event.button === 0) anchor = event.point;
    },
    move(event) {
      if (anchor) host.change(build(anchor, event));
    },
    up(event) {
      if (!anchor) return;
      const shape = build(anchor, event);
      anchor = null;
      host.change(null);
      // 过小视为误触，不提交
      if (shape.width < host.minSize || shape.height < host.minSize) return;
      host.commit(shape);
    },
    canFinish: () => false,
    finish: () => false,
    reset() {
      const had = anchor !== null;
      anchor = null;
      host.change(null);
      return had;
    },
  };
}

export const rectShape: ShapeDefinition<'rect'> = {
  type: 'rect',
  title: '矩形框选',
  icon: 'box',
  order: 10,
  createTool: createRectTool,
  bbox: ({ x, y, width, height }) => ({ x, y, width, height }),
  translate: (shape, dx, dy) => ({ ...shape, x: shape.x - dx, y: shape.y - dy }),
  crop: 'bbox',
  validate: (shape, { minSize }) => (shape.width < minSize || shape.height < minSize ? '选区过小' : null),
  render(shape, { toScreen, draft }) {
    const { x, y, width, height } = shape;
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    return <polygon class={draft ? 'kb-rsel__shape is-draft' : 'kb-rsel__shape'} points={svgPoints(corners, toScreen).join(' ')} />;
  },
};

// ---------- 多边形 ----------

function createPolygonTool(host: ToolHost<RegionShape<'polygon'>>): ShapeTool {
  let points: Point[] = [];
  let hover: Point | null = null;

  const publish = () => host.change(points.length ? { type: 'polygon', points: hover ? [...points, hover] : [...points] } : null);
  const clear = () => {
    points = [];
    hover = null;
    host.change(null);
  };

  const tool: ShapeTool = {
    down(event) {
      if (event.button !== 0) return;
      if (points.length >= 3 && distance(event.point, points[0]!) <= CLOSE_TOLERANCE / event.scale) {
        tool.finish();
        return;
      }
      const last = points[points.length - 1];
      // 双击会产生两次 down，重复点不入列
      if (last && distance(last, event.point) < 1 / event.scale) return;
      points.push(event.point);
      hover = event.point;
      publish();
    },
    move(event) {
      if (!points.length) return;
      hover = event.point;
      publish();
    },
    up() {},
    doubleClick() {
      tool.finish();
    },
    secondary() {
      tool.undo!();
    },
    canFinish: () => points.length >= 3,
    finish() {
      if (points.length < 3) return false;
      if (!host.commit({ type: 'polygon', points: [...points] })) return false;
      clear();
      return true;
    },
    undo() {
      if (!points.length) return false;
      points.pop();
      if (!points.length) hover = null;
      publish();
      return true;
    },
    reset() {
      const had = points.length > 0;
      clear();
      return had;
    },
  };
  return tool;
}

export const polygonShape: ShapeDefinition<'polygon'> = {
  type: 'polygon',
  title: '多边形框选',
  icon: 'polygon',
  order: 20,
  createTool: createPolygonTool,
  bbox: (shape) => bboxOfPoints(shape.points),
  translate: (shape, dx, dy) => ({ ...shape, points: shape.points.map((p) => ({ x: p.x - dx, y: p.y - dy })) }),
  crop: 'clip',
  clipPath(shape, path, offset) {
    path.beginPath();
    shape.points.forEach((p, i) => (i ? path.lineTo(p.x - offset.x, p.y - offset.y) : path.moveTo(p.x - offset.x, p.y - offset.y)));
    path.closePath();
  },
  validate(shape, { minSize }) {
    if (shape.points.length < 3) return '多边形至少需要 3 个顶点';
    // 先查自交：蝴蝶结形的有向面积可能为 0，会被误报为“过小”
    if (!isSimplePolygon(shape.points)) return '多边形的边不能相交';
    if (polygonArea(shape.points) < minSize * minSize) return '选区过小';
    return null;
  },
  render(shape, { toScreen, draft }) {
    const points = svgPoints(shape.points, toScreen);
    return (
      <>
        <polygon class={draft ? 'kb-rsel__shape is-draft' : 'kb-rsel__shape'} points={points.join(' ')} />
        {draft &&
          shape.points.map((p, i) => {
            const s = toScreen(p.x, p.y);
            return <circle key={i} class={i === 0 ? 'kb-rsel__vertex is-first' : 'kb-rsel__vertex'} cx={s.x} cy={s.y} r={i === 0 ? 5 : 3.5} />;
          })}
      </>
    );
  },
};

/** 内置形状 */
export const builtinShapes = [rectShape, polygonShape] as unknown as ShapeDefinition[];
