import type { Kernel } from '@kabel/core';
import { cx, useSelector } from '@kabel/ui';

/** 工具栏中的标记类型选择：数字键 1–9 对应前九个类型 */
export function LabelBar({ kernel }: { kernel: Kernel }) {
  const labels = useSelector((s) => s.annotator?.labels);
  const active = useSelector((s) => s.annotator?.active);
  if (!labels?.length) return null;
  return (
    <div class="kb-labelbar" role="radiogroup" aria-label="标记类型">
      {labels.map((label, i) => (
        <button
          key={label.id}
          type="button"
          role="radio"
          aria-checked={label.id === active}
          class={cx('kb-labelbar__item', label.id === active && 'is-active')}
          style={{ '--kb-anno-color': label.color }}
          title={i < 9 ? `${label.name}（${i + 1}）` : label.name}
          onClick={() => void kernel.execute('annotation.setLabel', label.id)}
        >
          {i < 9 && <span class="kb-labelbar__key">{i + 1}</span>}
          <span class="kb-labelbar__dot" />
          <span class="kb-labelbar__name">{label.name}</span>
        </button>
      ))}
    </div>
  );
}
