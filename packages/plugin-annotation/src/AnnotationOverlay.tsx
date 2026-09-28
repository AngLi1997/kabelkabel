import { clamp } from '@kabel/core';
import type { Point, ViewerOverlayProps } from '@kabel/plugin-viewer';
import { cx, useSelector } from '@kabel/ui';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { annotationActions, annotatorActions, createAnnotationId } from './slice';
import type { Annotation, BBox } from './types';

const EMPTY: Annotation[] = [];
/** 屏幕上小于该尺寸（px）的拖拽不创建标记，避免误触 */
const MIN_DRAW = 4;

type Operation =
  | { kind: 'draw'; start: Point }
  | { kind: 'move'; id: string; start: Point; origin: BBox }
  | { kind: 'resize'; id: string; fixed: Point };

/** 按住空格时临时切换为拖动平移 */
function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof Element && t.matches('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !editable(e.target)) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setHeld(false);
    };
    const reset = () => setHeld(false);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return held;
}

const rectFrom = (a: Point, b: Point): BBox => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

const roundBox = (b: BBox): BBox => {
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  return { x, y, w: Math.round(b.x + b.w) - x, h: Math.round(b.y + b.h) - y };
};

/** 影像上的标记层：框选新建、点击选中、拖动移动、拖动角点调整大小 */
export function AnnotationOverlay({ kernel, image, width, height, toScreen, toImage, scale }: ViewerOverlayProps) {
  const boxes = useSelector((s) => s.annotations?.[image.id] ?? EMPTY);
  const annotator = useSelector((s) => s.annotator);
  const layer = useRef<HTMLDivElement>(null);
  const op = useRef<Operation | null>(null);
  // 拖拽中的预览框；同时存入 ref，保证 pointerup 读到最新值（状态更新是异步批量的）
  const [draft, setDraftState] = useState<(BBox & { id?: string }) | null>(null);
  const draftRef = useRef(draft);
  const setDraft = (next: (BBox & { id?: string }) | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const space = useSpaceHeld();

  useEffect(() => {
    kernel.dispatch(annotatorActions.setSize({ imageId: image.id, size: { width, height } }));
  }, [kernel, image.id, width, height]);

  if (!annotator) return null;
  const { labels, selected, hovered, tool } = annotator;
  const colorOf = (label: string) => labels.find((l) => l.id === label)?.color ?? '#8d8d8d';
  const nameOf = (label: string) => labels.find((l) => l.id === label)?.name ?? label;

  const pointer = (event: PointerEvent): Point => {
    const rect = layer.current!.getBoundingClientRect();
    const p = toImage(event.clientX - rect.left, event.clientY - rect.top);
    return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
  };
  const capture = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onLayerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || space || tool !== 'draw') return;
    capture(event);
    const start = pointer(event);
    op.current = { kind: 'draw', start };
    kernel.dispatch(annotatorActions.select(null));
    setDraft({ ...start, w: 0, h: 0 });
  };

  const onBoxDown = (box: Annotation) => (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || space) return;
    capture(event);
    kernel.dispatch(annotatorActions.select(box.id));
    op.current = { kind: 'move', id: box.id, start: pointer(event), origin: box };
  };

  const onHandleDown = (box: Annotation, fixed: Point) => (event: JSX.TargetedPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    capture(event);
    op.current = { kind: 'resize', id: box.id, fixed };
  };

  const onMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const current = op.current;
    if (!current) return;
    const p = pointer(event);
    if (current.kind === 'draw') setDraft(rectFrom(current.start, p));
    else if (current.kind === 'resize') setDraft({ ...rectFrom(current.fixed, p), id: current.id });
    else {
      const { origin } = current;
      const x = clamp(origin.x + p.x - current.start.x, 0, width - origin.w);
      const y = clamp(origin.y + p.y - current.start.y, 0, height - origin.h);
      setDraft({ x, y, w: origin.w, h: origin.h, id: current.id });
    }
  };

  const onUp = () => {
    const current = op.current;
    const draft = draftRef.current;
    op.current = null;
    setDraft(null);
    if (!current || !draft) return;
    const box = roundBox(draft);
    if (current.kind === 'draw') {
      if (draft.w * scale < MIN_DRAW || draft.h * scale < MIN_DRAW || box.w < 1 || box.h < 1) return;
      const annotation: Annotation = { id: createAnnotationId(), label: kernel.getState().annotator.active, ...box };
      kernel.dispatch(annotationActions.add({ imageId: image.id, annotation }, { history: { label: `添加标记「${nameOf(annotation.label)}」` } }));
      return;
    }
    if (box.w < 1 || box.h < 1) return;
    kernel.dispatch(
      annotationActions.update(
        { imageId: image.id, id: current.id, patch: box },
        { history: { label: current.kind === 'move' ? '移动标记' : '调整标记大小' } },
      ),
    );
  };

  const screenRect = (b: BBox): JSX.CSSProperties => {
    const a = toScreen(b.x, b.y);
    const c = toScreen(b.x + b.w, b.y + b.h);
    return {
      left: `${Math.min(a.x, c.x)}px`,
      top: `${Math.min(a.y, c.y)}px`,
      width: `${Math.abs(a.x - c.x)}px`,
      height: `${Math.abs(a.y - c.y)}px`,
    };
  };

  const interactive = !space;
  return (
    <div
      ref={layer}
      class={cx('kb-anno', tool === 'draw' && interactive && 'is-drawing')}
      onPointerDown={onLayerDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {boxes.map((box, index) => {
        const editing = draft?.id === box.id ? draft : null;
        const shown = editing ?? box;
        const isSelected = box.id === selected;
        const corners: Point[] = [
          { x: shown.x, y: shown.y },
          { x: shown.x + shown.w, y: shown.y },
          { x: shown.x + shown.w, y: shown.y + shown.h },
          { x: shown.x, y: shown.y + shown.h },
        ];
        return (
          <div
            key={box.id}
            class={cx('kb-anno__box', isSelected && 'is-selected', box.id === hovered && 'is-hovered', interactive && 'is-interactive')}
            style={{ ...screenRect(shown), '--kb-anno-color': colorOf(box.label) }}
            onPointerDown={onBoxDown(box)}
          >
            <span class="kb-anno__tag">
              {index + 1} {nameOf(box.label)}
            </span>
            {isSelected &&
              interactive &&
              corners.map((corner, i) => {
                const s = toScreen(corner.x, corner.y);
                const center = toScreen(shown.x + shown.w / 2, shown.y + shown.h / 2);
                const rect = screenRect(shown);
                return (
                  <span
                    key={i}
                    class="kb-anno__handle"
                    style={{
                      left: `${s.x - parseFloat(rect.left as string)}px`,
                      top: `${s.y - parseFloat(rect.top as string)}px`,
                      cursor: (s.x - center.x) * (s.y - center.y) > 0 ? 'nwse-resize' : 'nesw-resize',
                    }}
                    onPointerDown={onHandleDown(box, corners[(i + 2) % 4]!)}
                  />
                );
              })}
          </div>
        );
      })}
      {draft && !draft.id && (
        <div class="kb-anno__box is-draft" style={{ ...screenRect(draft), '--kb-anno-color': colorOf(annotator.active) }} />
      )}
    </div>
  );
}
