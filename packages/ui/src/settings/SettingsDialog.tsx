import { ExtensionPoints } from '@kabel/core';
import { useEffect, useRef } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { ViewHost } from '../components/ViewHost';
import { useContributions, useKernel, useSelector, useStoreState } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';
import { settingsActions } from './settings-plugin';

/** 设置弹窗：覆盖整个工作台，左侧分类导航、右侧分类页内容 */
export function SettingsDialog() {
  const open = useSelector((s) => !!s.settings?.open);
  return open ? <Dialog /> : null;
}

function Dialog() {
  const kernel = useKernel();
  const state = useStoreState();
  const pages = useContributions(ExtensionPoints.settings).filter((p) => !p.when || p.when(state, kernel));
  const active = pages.find((p) => p.id === state.settings.page) ?? pages[0];
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `kb-settings-title-${kernel.id}`;
  const close = () => kernel.dispatch(settingsActions.close());

  // 打开时聚焦弹窗，关闭后焦点回到打开前的元素
  useEffect(() => {
    const previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      class="kb-settings"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
      }}
    >
      <div ref={dialog} class="kb-settings__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header class="kb-settings__header">
          <span id={titleId} class="kb-settings__title">
            设置
          </span>
          <IconButton icon="close" title="关闭 (Esc)" onClick={close} />
        </header>
        <div class="kb-settings__body">
          <nav class="kb-settings__nav" role="tablist" aria-orientation="vertical">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-selected={page === active}
                class={cx('kb-settings__nav-item', page === active && 'is-active')}
                onClick={() => kernel.dispatch(settingsActions.setPage(page.id))}
              >
                {page.icon && <Icon name={page.icon} />}
                <span>{page.title}</span>
              </button>
            ))}
          </nav>
          <div class="kb-settings__content kb-scroll" role="tabpanel">
            {active && <ViewHost key={active.id} view={active.view} props={{ kernel }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
