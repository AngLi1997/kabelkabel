import { describe, expect, it } from 'vitest';
import { polygonShape, rectShape, type RegionShape, type ToolHost, type ToolPointerEvent } from '../src';

const bounds = { width: 1000, height: 800 };
const at = (x: number, y: number, extra: Partial<ToolPointerEvent> = {}): ToolPointerEvent => ({
  point: { x, y },
  raw: { x, y },
  button: 0,
  shiftKey: false,
  altKey: false,
  scale: 1,
  bounds,
  ...extra,
});

function host<S extends RegionShape>(accept = true) {
  const commits: S[] = [];
  const drafts: (S | null)[] = [];
  const h: ToolHost<S> = {
    minSize: 4,
    change: (d) => void drafts.push(d),
    commit: (s) => {
      commits.push(s);
      return accept;
    },
  };
  return { h, commits, drafts };
}

describe('矩形工具', () => {
  it('拖拽产生规范化矩形，松开时提交', () => {
    const { h, commits } = host<RegionShape<'rect'>>();
    const tool = rectShape.createTool(h);
    tool.down(at(100, 100));
    tool.move(at(40, 60));
    tool.up(at(40, 60));
    expect(commits).toEqual([{ type: 'rect', x: 40, y: 60, width: 60, height: 40 }]);
  });

  it('Shift 约束为正方形', () => {
    const { h, commits } = host<RegionShape<'rect'>>();
    const tool = rectShape.createTool(h);
    tool.down(at(10, 10));
    tool.move(at(110, 50, { shiftKey: true }));
    tool.up(at(110, 50, { shiftKey: true }));
    expect(commits[0]).toMatchObject({ width: 100, height: 100 });
  });

  it('小于 minSize 视为误触，不提交', () => {
    const { h, commits } = host<RegionShape<'rect'>>();
    const tool = rectShape.createTool(h);
    tool.down(at(10, 10));
    tool.up(at(12, 12));
    expect(commits).toEqual([]);
  });

  it('非左键不开始绘制；reset 丢弃拖拽中的草稿', () => {
    const { h, commits, drafts } = host<RegionShape<'rect'>>();
    const tool = rectShape.createTool(h);
    tool.down(at(10, 10, { button: 2 }));
    tool.up(at(100, 100));
    expect(commits).toEqual([]);
    tool.down(at(10, 10));
    tool.move(at(50, 50));
    expect(tool.reset()).toBe(true);
    expect(drafts.at(-1)).toBeNull();
    tool.up(at(50, 50));
    expect(commits).toEqual([]);
  });

  it('bbox / translate', () => {
    const shape: RegionShape<'rect'> = { type: 'rect', x: 10, y: 20, width: 30, height: 40 };
    expect(rectShape.bbox(shape)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(rectShape.translate(shape, 10, 20)).toEqual({ type: 'rect', x: 0, y: 0, width: 30, height: 40 });
  });
});

describe('多边形工具', () => {
  const triangle = [at(0, 0), at(100, 0), at(50, 80)];

  it('逐点点击，Enter（finish）提交；预览点跟随鼠标', () => {
    const { h, commits, drafts } = host<RegionShape<'polygon'>>();
    const tool = polygonShape.createTool(h);
    expect(tool.canFinish()).toBe(false);
    triangle.forEach((e) => tool.down(e));
    tool.move(at(60, 90));
    expect((drafts.at(-1) as RegionShape<'polygon'>).points).toHaveLength(4);
    expect(tool.canFinish()).toBe(true);
    expect(tool.finish()).toBe(true);
    expect(commits[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]);
    expect(drafts.at(-1)).toBeNull();
  });

  it('点击起点闭合；双击闭合且重复点不入列', () => {
    const closed = host<RegionShape<'polygon'>>();
    const a = polygonShape.createTool(closed.h);
    [...triangle, at(2, 2)].forEach((e) => a.down(e));
    expect(closed.commits).toHaveLength(1);
    expect(closed.commits[0]!.points).toHaveLength(3);

    const dbl = host<RegionShape<'polygon'>>();
    const b = polygonShape.createTool(dbl.h);
    triangle.forEach((e) => b.down(e));
    b.down(at(50, 80));
    b.doubleClick!(at(50, 80));
    expect(dbl.commits[0]!.points).toHaveLength(3);
  });

  it('被拒绝时保留草稿；右键撤销上一个顶点', () => {
    const { h, commits } = host<RegionShape<'polygon'>>(false);
    const tool = polygonShape.createTool(h);
    triangle.forEach((e) => tool.down(e));
    expect(tool.finish()).toBe(false);
    expect(tool.canFinish()).toBe(true);
    tool.secondary!(at(0, 0, { button: 2 }));
    expect(tool.canFinish()).toBe(false);
    expect(commits).toHaveLength(1);
    expect(tool.reset()).toBe(true);
    expect(tool.reset()).toBe(false);
  });

  it('校验：顶点数、面积与自交', () => {
    const v = (points: { x: number; y: number }[]) => polygonShape.validate!({ type: 'polygon', points }, { minSize: 4, bounds });
    expect(v([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toContain('3 个顶点');
    expect(v([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe('选区过小');
    expect(v([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toContain('相交');
    expect(v([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }])).toBeNull();
  });

  it('clipPath 写入相对裁剪图的路径', () => {
    const calls: string[] = [];
    const path = {
      beginPath: () => void calls.push('begin'),
      moveTo: (x: number, y: number) => void calls.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => void calls.push(`L${x},${y}`),
      arc: () => {},
      closePath: () => void calls.push('close'),
    };
    polygonShape.clipPath!({ type: 'polygon', points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 40 }] }, path, { x: 10, y: 20 });
    expect(calls).toEqual(['begin', 'M0,0', 'L20,0', 'L10,20', 'close']);
  });
});
