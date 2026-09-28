import { ExtensionPoints, type StatusItem } from '@kabel/core';
import { ViewHost } from '../components/ViewHost';
import { useContributions, useKernel, useStoreState } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';
import { runAction } from './run';

export function StatusBar() {
  const items = useContributions(ExtensionPoints.statusbar);
  useStoreState();
  const left = items.filter((i) => (i.align ?? 'left') === 'left');
  const right = items.filter((i) => i.align === 'right');
  return (
    <div class="kb-statusbar" role="status">
      <div class="kb-statusbar__group">{left.map((item) => <StatusEntry key={item.id} item={item} />)}</div>
      <div class="kb-statusbar__group">{right.map((item) => <StatusEntry key={item.id} item={item} />)}</div>
    </div>
  );
}

function StatusEntry({ item }: { item: StatusItem }) {
  const kernel = useKernel();
  const state = kernel.getState();
  if (item.view) return <ViewHost view={item.view} props={{ kernel }} />;
  const text = item.text?.(state, kernel);
  if (!text) return null;
  const tone = item.tone?.(state) ?? 'default';
  const content = (
    <>
      {item.icon && <Icon name={item.icon} />}
      <span>{text}</span>
    </>
  );
  const className = cx('kb-statusbar__item', tone !== 'default' && `is-${tone}`);
  return item.command ? (
    <button type="button" class={cx(className, 'is-action')} title={item.tooltip} onClick={() => runAction(kernel, item)}>
      {content}
    </button>
  ) : (
    <span class={className} title={item.tooltip}>
      {content}
    </span>
  );
}
