import type { ComponentChildren } from 'preact';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';

export interface SectionProps {
  id?: string;
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  extra?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
}

/** 可折叠分组（带左侧强调线的分组标题） */
export function Section({ id, title, collapsed, onToggle, extra, children, class: className }: SectionProps) {
  return (
    <section id={id} class={cx('kb-section', collapsed && 'is-collapsed', className)}>
      <header class="kb-section__header">
        <button type="button" class="kb-section__toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} />
          <span class="kb-section__title">{title}</span>
        </button>
        {extra && <div class="kb-section__extra">{extra}</div>}
      </header>
      {!collapsed && <div class="kb-section__body">{children}</div>}
    </section>
  );
}
