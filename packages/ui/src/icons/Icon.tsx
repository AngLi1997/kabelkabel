import { useUiConfig } from '../hooks';
import { cx } from '../utils';
import { DEFAULT_ICON_PREFIX } from './config';

export interface IconProps {
  name: string;
  size?: number;
  class?: string;
  title?: string;
}

export function Icon({ name, size, class: className, title }: IconProps) {
  const { icons } = useUiConfig();
  const resolved = icons.map?.[name] ?? name;
  const style = size ? { width: `${size}px`, height: `${size}px`, fontSize: `${size}px` } : undefined;
  if (icons.mode === 'font') {
    const prefix = icons.prefix ?? 'icon-';
    return (
      <i
        class={cx('kb-icon', icons.fontClass ?? 'iconfont', `${prefix}${resolved}`, className)}
        style={style}
        aria-hidden={title ? undefined : 'true'}
        title={title}
      />
    );
  }
  // 配置了 map 时只有映射过的图标走宿主前缀，其余回退到内置图标
  const useHost = icons.map ? name in icons.map : !!(icons.scriptUrl || icons.prefix);
  const prefix = useHost ? (icons.prefix ?? DEFAULT_ICON_PREFIX) : DEFAULT_ICON_PREFIX;
  return (
    <svg class={cx('kb-icon', className)} style={style} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <use href={`#${prefix}${resolved}`} />
    </svg>
  );
}
