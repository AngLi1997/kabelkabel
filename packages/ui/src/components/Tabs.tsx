import { Icon } from '../icons/Icon';
import { cx } from '../utils';

export interface TabItem {
  id: string;
  title: string;
  icon?: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  active?: string;
  onChange: (id: string) => void;
  class?: string;
}

export function Tabs({ items, active, onChange, class: className }: TabsProps) {
  return (
    <div class={cx('kb-tabs', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          class={cx('kb-tabs__tab', item.id === active && 'is-active')}
          onClick={() => onChange(item.id)}
        >
          {item.icon && <Icon name={item.icon} />}
          <span>{item.title}</span>
        </button>
      ))}
    </div>
  );
}
