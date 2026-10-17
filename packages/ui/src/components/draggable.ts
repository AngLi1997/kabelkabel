import type { JSX, RefObject } from 'preact';
import { useRef, useState } from 'preact/hooks';

/** 拖动柄内不触发拖动的元素：按钮、输入框等交互控件，及显式标记 `data-kb-no-drag` 的区域 */
const INTERACTIVE = 'button, input, textarea, select, a, label, [contenteditable="true"], [data-kb-no-drag]';

interface DragState {
  x: number;
  y: number;
  ox: number;
  oy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Draggable {
  /** 应用到弹窗元素（`transform` 平移） */
  style: JSX.CSSProperties | undefined;
  /** 展开到拖动柄（如弹窗头部）上 */
  handleProps: {
    class: string;
    onPointerDown: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  /** 回到初始位置 */
  reset: () => void;
}

const fit = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * 弹窗拖动：按住拖动柄移动弹窗，位置限制在弹窗的定位容器（遮罩层）之内。
 * 弹窗卸载后位置不保留，下次打开回到居中。
 *
 * ```tsx
 * const drag = useDraggable(dialogRef);
 * <div ref={dialogRef} style={drag.style}><header {...drag.handleProps}>标题</header></div>
 * ```
 */
export function useDraggable(ref: RefObject<HTMLElement>): Draggable {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (event.button !== 0 || !el || (event.target as Element).closest?.(INTERACTIVE)) return;
    const container = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
    if (!container) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const box = el.getBoundingClientRect();
    const area = container.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
      minX: offset.x + area.left - box.left,
      maxX: offset.x + area.right - box.right,
      minY: offset.y + area.top - box.top,
      maxY: offset.y + area.bottom - box.bottom,
    };
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    setOffset({ x: fit(d.ox + event.clientX - d.x, d.minX, d.maxX), y: fit(d.oy + event.clientY - d.y, d.minY, d.maxY) });
  };

  const end = () => {
    drag.current = null;
  };

  return {
    style: offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined,
    handleProps: { class: 'kb-drag-handle', onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    reset: () => setOffset({ x: 0, y: 0 }),
  };
}
