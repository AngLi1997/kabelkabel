import type { FieldsService } from '@kabel/plugin-fields';
import type { StageOverlayProps } from '@kabel/plugin-workspace';
import { cx, useSelector } from '@kabel/ui';

/**
 * 字段证据覆盖层：当前文件上带证据的字段画出虚线框与字段名，当前字段高亮；
 * 点击字段名定位到该字段。
 */
export function EvidenceOverlay({ image, toScreen, fields }: StageOverlayProps & { fields: FieldsService }) {
  const values = useSelector((s) => s.fields?.values);
  const focus = useSelector((s) => s.fieldsView?.focus ?? null);
  const items = Object.entries(values ?? {}).filter(([, v]) => v.evidence?.bbox && v.evidence.documentId === image.id);
  if (!items.length) return null;
  return (
    <svg class="kb-excerpt__svg">
      {items.map(([key, v]) => {
        const { x, y, width, height } = v.evidence!.bbox!;
        const corners = [toScreen(x, y), toScreen(x + width, y), toScreen(x + width, y + height), toScreen(x, y + height)];
        const top = corners.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
        const label = fields.field(key)?.label ?? key;
        return (
          <g key={key} class={cx('kb-excerpt__box', key === focus && 'is-active')}>
            <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} />
            <text
              x={top.x}
              y={top.y - 4}
              class="kb-excerpt__label"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => fields.focus(key)}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
