import { useContributions, useSelector } from '@kabel/ui';
import type { StageOverlayProps } from '@kabel/plugin-workspace';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { RegionExtensions, type ToolPointerEvent } from './contract';
import { clampPoint } from './geometry';

export type PointerKind = 'down' | 'move' | 'up' | 'dblclick' | 'secondary';

/** 覆盖层把指针事件（已换算为图片坐标）交给插件，由当前形状的状态机处理 */
export interface OverlayController {
  pointer(kind: PointerKind, event: ToolPointerEvent): void;
}

/**
 * 框选覆盖层：铺满舞台，仅在框选工具占用舞台（`interactive`）时接收指针。
 * 平移由工作台在捕获阶段接管（空格 + 左键 / 中键），这里收不到那些事件。
 */
export function RegionOverlay({ controller, interactive, width, height, scale, toImage, toScreen }: StageOverlayProps & { controller: OverlayController }) {
  const draft = useSelector((s) => s.regionSelect?.draft ?? null);
  const shapes = useContributions(RegionExtensions.shapes);
  const root = useRef<HTMLDivElement>(null);

  const convert = (event: JSX.TargetedPointerEvent<HTMLDivElement> | JSX.TargetedMouseEvent<HTMLDivElement>): ToolPointerEvent => {
    const box = root.current!.getBoundingClientRect();
    const raw = toImage(event.clientX - box.left, event.clientY - box.top);
    const bounds = { width, height };
    return { point: clampPoint(raw, bounds), raw, button: event.button, shiftKey: event.shiftKey, altKey: event.altKey, scale, bounds };
  };

  const def = draft ? shapes.find((s) => s.type === draft.type) : undefined;
  return (
    <div
      ref={root}
      class="kb-rsel"
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        controller.pointer('down', convert(event));
      }}
      onPointerMove={(event) => interactive && controller.pointer('move', convert(event))}
      onPointerUp={(event) => interactive && event.button === 0 && controller.pointer('up', convert(event))}
      onDblClick={(event) => interactive && controller.pointer('dblclick', convert(event as unknown as JSX.TargetedMouseEvent<HTMLDivElement>))}
      onContextMenu={(event) => {
        if (!interactive) return;
        // 工具激活时右键归工具（如撤销上一个顶点），不弹右键菜单
        event.preventDefault();
        event.stopPropagation();
        controller.pointer('secondary', convert(event));
      }}
    >
      <svg class="kb-rsel__svg" aria-hidden="true">
        {def && draft && def.render(draft, { toScreen, scale, draft: true })}
      </svg>
    </div>
  );
}
