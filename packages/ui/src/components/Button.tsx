import type { ComponentChildren, JSX } from 'preact';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';

export interface ButtonProps {
  icon?: string;
  children?: ComponentChildren;
  variant?: 'default' | 'primary' | 'text' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** 切换类按钮的选中态 */
  active?: boolean;
  title?: string;
  class?: string;
  onClick?: (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => void;
}

export function Button({ icon, children, variant = 'default', size = 'md', disabled, active, title, class: className, onClick }: ButtonProps) {
  const iconOnly = !children;
  return (
    <button
      type="button"
      class={cx(
        'kb-btn',
        `kb-btn--${variant}`,
        size === 'sm' && 'kb-btn--sm',
        iconOnly && 'kb-btn--icon',
        active && 'is-active',
        className,
      )}
      disabled={disabled}
      title={title}
      aria-label={iconOnly ? title : undefined}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {children != null && <span class="kb-btn__label">{children}</span>}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon'> {
  icon: string;
  title: string;
}

/** 仅图标的文字按钮，必须提供 title 作为无障碍名称与提示 */
export function IconButton(props: IconButtonProps) {
  return <Button variant="text" size="sm" {...props} />;
}
