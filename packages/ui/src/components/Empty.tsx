import type { ComponentChildren } from 'preact';
import { Icon } from '../icons/Icon';

export interface EmptyProps {
  icon?: string;
  text: string;
  children?: ComponentChildren;
}

export function Empty({ icon, text, children }: EmptyProps) {
  return (
    <div class="kb-empty">
      {icon && <Icon name={icon} size={28} />}
      <span>{text}</span>
      {children}
    </div>
  );
}
