import type { PanelViewProps } from '@kabel/core';
import { cx, Icon, useKernel, useSelector } from '@kabel/ui';

const hhmmss = (t: number) => new Date(t).toTimeString().slice(0, 8);

/** 操作记录：显示撤销/重做栈，点击任一记录跳转到该状态 */
export function HistoryPanel(_: PanelViewProps) {
  const kernel = useKernel();
  const past = useSelector((s) => s.history.past);
  const future = useSelector((s) => s.history.future);

  // 由新到旧：重做栈（灰显） → 撤销栈 → 初始状态
  const rows = [
    ...[...future].reverse().map((e, i) => ({ ...e, position: past.length + future.length - i, undone: true })),
    ...[...past].reverse().map((e, i) => ({ ...e, position: past.length - i, undone: false })),
  ];

  return (
    <ul class="kb-inspector__list kb-scroll">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            class={cx('kb-inspector__entry', row.undone && 'is-undone', row.position === past.length && 'is-current')}
            onClick={() => kernel.history.jump(row.position)}
          >
            <span class="kb-inspector__label">{row.label}</span>
            <span class="kb-inspector__time">{hhmmss(row.time)}</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          class={cx('kb-inspector__entry', past.length === 0 && 'is-current')}
          onClick={() => kernel.history.jump(0)}
        >
          <Icon name="history" />
          <span class="kb-inspector__label">初始状态</span>
        </button>
      </li>
    </ul>
  );
}
