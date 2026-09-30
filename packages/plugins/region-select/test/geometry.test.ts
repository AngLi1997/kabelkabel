import { describe, expect, it } from 'vitest';
import { bboxOfPoints, clampPoint, isSimplePolygon, polygonArea, rectFromPoints, snapBBox, squareFrom } from '../src';

const bounds = { width: 100, height: 80 };

describe('geometry', () => {
  it('clampPoint 限制在图片范围内', () => {
    expect(clampPoint({ x: -5, y: 90 }, bounds)).toEqual({ x: 0, y: 80 });
    expect(clampPoint({ x: 50, y: 20 }, bounds)).toEqual({ x: 50, y: 20 });
  });

  it('rectFromPoints 规范化任意方向的对角点', () => {
    expect(rectFromPoints({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });

  it('squareFrom 取较长边并保证不越出图片', () => {
    expect(squareFrom({ x: 10, y: 10 }, { x: 40, y: 20 }, bounds)).toEqual({ x: 40, y: 40 });
    expect(squareFrom({ x: 10, y: 10 }, { x: -20, y: 5 }, bounds)).toEqual({ x: 0, y: 0 });
    // 向下拖：高度只剩 20，边长被限制
    expect(squareFrom({ x: 10, y: 60 }, { x: 90, y: 70 }, bounds)).toEqual({ x: 30, y: 80 });
  });

  it('snapBBox 向外取整并限制范围', () => {
    expect(snapBBox({ x: 1.4, y: 2.6, width: 10.2, height: 5 }, bounds)).toEqual({ x: 1, y: 2, width: 11, height: 6 });
    expect(snapBBox({ x: 90, y: 70, width: 50, height: 50 }, bounds)).toEqual({ x: 90, y: 70, width: 10, height: 10 });
  });

  it('bboxOfPoints / polygonArea', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(bboxOfPoints(square)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(polygonArea(square)).toBe(100);
  });

  it('isSimplePolygon 识别自交（蝴蝶结）', () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(true);
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(false);
  });
});
