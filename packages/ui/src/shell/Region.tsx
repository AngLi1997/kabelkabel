import type { PanelContribution, RegionId } from '@kabel/core';
import type { JSX } from 'preact';
import { IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { Tabs } from '../components/Tabs';
import { ViewHost } from '../components/ViewHost';
import { useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { layoutActions, type RegionConfig } from '../layout/layout-plugin';
import { cx } from '../utils';
import { PanelActions } from './PanelActions';
import { PanelStack } from './PanelStack';

export interface RegionProps {
  region: RegionId;
  config: RegionConfig;
  panels: readonly PanelContribution[];
  /** 窄屏单栏模式：不显示折叠/最大化 */
  compact: boolean;
  collapsed: boolean;
  hidden?: boolean;
  style?: JSX.CSSProperties;
}

/**
 * 区域容器：头部（标题/标签页、面板操作、最大化、折叠）+ 内容。
 * 折叠或隐藏时内容保持挂载，保证 DomView（如 Vue Teleport）与面板内部状态不丢失。
 */
export function Region({ region, config, panels, compact, collapsed, hidden, style }: RegionProps) {
  const kernel = useKernel();
  const maximized = useSelector((s) => s.layout?.maximized === region);
  const activeState = useSelector((s) => s.layout?.active[region]);
  const activeId = panels.some((p) => p.id === activeState) ? activeState : panels[0]?.id;
  const active = panels.find((p) => p.id === activeId);
  const stack = config.mode === 'stack';
  const canCollapse = !compact && config.collapsible;
  const canMaximize = !compact;

  const toggle = () => kernel.execute(region === 'left' ? 'layout.toggleLeft' : 'layout.toggleRight');
  const collapseButton = canCollapse && (
    <IconButton icon={region === 'left' ? 'fold-left' : 'fold-right'} title={`收起${config.title}`} onClick={toggle} />
  );

  let heading;
  if (stack || panels.length === 0) heading = <span class="kb-region__title">{config.title}</span>;
  else if (panels.length === 1) heading = <span class="kb-region__title">{panels[0]!.title}</span>;
  else
    heading = (
      <Tabs
        items={panels}
        active={activeId}
        onChange={(panelId) => kernel.dispatch(layoutActions.setActive({ region, panelId }))}
      />
    );

  return (
    <div
      class={cx('kb-region', `kb-region--${region}`, collapsed && 'is-collapsed', maximized && 'is-maximized')}
      style={style}
      hidden={hidden}
      data-region={region}
    >
      {collapsed && (
        <button type="button" class="kb-region__rail" title={`展开${config.title}`} onClick={toggle}>
          <Icon name={region === 'left' ? 'fold-right' : 'fold-left'} />
          <span class="kb-region__rail-title">{config.title}</span>
        </button>
      )}
      <div class="kb-region__inner" hidden={collapsed}>
        <header class="kb-region__header" onDblClick={(e) => canMaximize && e.target === e.currentTarget && kernel.execute('layout.maximize', region)}>
          {region === 'right' && collapseButton}
          <div class="kb-region__heading">{heading}</div>
          <div class="kb-region__tools">
            {!stack && <PanelActions actions={active?.actions} />}
            {canMaximize && (
              <IconButton
                icon={maximized ? 'restore' : 'maximize'}
                title={maximized ? '还原 (Esc)' : '最大化'}
                onClick={() => kernel.execute('layout.maximize', region)}
              />
            )}
            {region === 'left' && collapseButton}
          </div>
        </header>
        <div class="kb-region__body">
          {panels.length === 0 && <Empty text="暂无内容" />}
          {stack ? (
            <PanelStack panels={panels} region={region} />
          ) : (
            panels.map((panel) => (
              <div key={panel.id} class="kb-region__pane" hidden={panel.id !== activeId}>
                <ViewHost view={panel.view} props={{ kernel, panelId: panel.id, region }} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
