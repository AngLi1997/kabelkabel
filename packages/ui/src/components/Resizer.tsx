import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { cx } from '../utils';

export interface ResizerProps {
  /** `x`：左右拖动（调整宽度）；`y`：上下拖动（调整高度） */
  axis: 'x' | 'y';
  /** 开始拖动，调用方在此记录初始尺寸 */
  onStart?: () => void;
  /** 相对拖动起点的累计位移（px） */
  onMove: (delta: number) => void;
  onEnd?: () => void;
  /** 双击恢复默认尺寸 */
  onReset?: () => void;
  label?: string;
  class?: string;
}

const KEY_STEP = 16;

/** 通用拖拽分隔条：指针拖动、键盘方向键微调、双击复位 */
export function Resizer({ axis, onStart, onMove, onEnd, onReset, label, class: className }: ResizerProps) {
  const drag = useRef<{ origin: number; root: Element | null } | null>(null);

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const root = target.closest('.kb-root');
    root?.classList.add('is-resizing', `is-resizing-${axis}`);
    drag.current = { origin: axis === 'x' ? event.clientX : event.clientY, root };
    onStart?.();
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onMove((axis === 'x' ? event.clientX : event.clientY) - drag.current.origin);
  };

  const finish = () => {
    if (!drag.current) return;
    drag.current.root?.classList.remove('is-resizing', `is-resizing-${axis}`);
    drag.current = null;
    onEnd?.();
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const index = keys.indexOf(event.key);
    if (index < 0) return;
    event.preventDefault();
    onStart?.();
    onMove(index === 0 ? -KEY_STEP : KEY_STEP);
    onEnd?.();
  };

  return (
    <div
      class={cx('kb-resizer', `kb-resizer--${axis}`, className)}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDblClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
