import { ExtensionPoints } from '@kabel/core';
import { Button } from '../components/Button';
import { useContributions, useKernel, useStoreState } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';

/** 工具栏下方的横幅（扩展点 `ExtensionPoints.banners`），没有可见横幅时不渲染 */
export function Banners() {
  const kernel = useKernel();
  const state = useStoreState();
  const items = useContributions(ExtensionPoints.banners);
  const visible = items
    .map((item) => ({ item, text: item.text(state, kernel) }))
    .filter((entry): entry is { item: (typeof items)[number]; text: string } => !!entry.text);
  if (!visible.length) return null;
  return (
    <div class="kb-banners">
      {visible.map(({ item, text }) => (
        <div key={item.id} class={cx('kb-banner', `kb-banner--${item.tone ?? 'info'}`)} role="status">
          {item.icon && <Icon name={item.icon} />}
          <span class="kb-banner__text">{text}</span>
          {item.action && (
            <Button size="sm" variant="text" onClick={() => void kernel.execute(item.action!.command, ...(item.action!.args ?? []))}>
              {item.action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
