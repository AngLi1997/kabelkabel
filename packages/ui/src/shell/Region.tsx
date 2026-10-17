import type { PanelContribution, RegionId } from '@kabel/core';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { Resizer } from '../components/Resizer';
import { Tabs } from '../components/Tabs';
import { ViewHost } from '../components/ViewHost';
import { useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { layoutActions, slotKey, type RegionConfig } from '../layout/layout-plugin';
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
 * 存在 `slot: 'bottom'` 的面板时，区域分为上下两组（中间可拖拽调整高度），下半区有自己的标题/标签页。
 * 折叠或隐藏时内容保持挂载，保证 DomView（如 Vue Teleport）与面板内部状态不丢失。
 */
export function Region({ region, config, panels, compact, collapsed, hidden, style }: RegionProps) {
  const kernel = useKernel();
  const maximized = useSelector((s) => s.layout?.maximized === region);
  // 下半区面板（slot: 'bottom'）单独成组；区域内只有下半区面板时按主区显示
  const lowerAll = panels.filter((p) => p.slot === 'bottom');
  const upperAll = panels.filter((p) => p.slot !== 'bottom');
  const split = upperAll.length > 0 && lowerAll.length > 0;
  const upper = split || upperAll.length ? upperAll : lowerAll;
  const lower = split ? lowerAll : [];
  const upperKey = slotKey(region, upperAll.length ? 'top' : 'bottom');
  const activeState = useSelector((s) => s.layout?.active[upperKey]);
  const lowerActiveState = useSelector((s) => s.layout?.active[slotKey(region, 'bottom')]);
  const ratio = useSelector((s) => s.layout?.splits[region]) ?? config.split;
  const activeId = upper.some((p) => p.id === activeState) ? activeState : upper[0]?.id;
  const active = upper.find((p) => p.id === activeId);
  const lowerActiveId = lower.some((p) => p.id === lowerActiveState) ? lowerActiveState : lower[0]?.id;
  const stack = config.mode === 'stack';
  const canCollapse = !compact && config.collapsible;
  const canMaximize = !compact;
  const upperRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ top: number; bottom: number } | null>(null);

  // 区域内只有一个面板时，折叠条与按钮提示直接使用面板标题
  const name = panels.length === 1 ? panels[0]!.title : config.title;
  const toggle = () => kernel.execute(region === 'left' ? 'layout.toggleLeft' : 'layout.toggleRight');
  const collapseButton = canCollapse && (
    <IconButton icon={region === 'left' ? 'fold-left' : 'fold-right'} title={`收起${name}`} onClick={toggle} />
  );

  let heading;
  if (stack || upper.length === 0) heading = <span class="kb-region__title">{config.title}</span>;
  else heading = <GroupHeading panels={upper} active={activeId} onChange={(panelId) => kernel.dispatch(layoutActions.setActive({ region, panelId, slot: upperAll.length ? 'top' : 'bottom' }))} />;

  const upperBody = (
    <>
      {upper.length === 0 && <Empty text="暂无内容" />}
      {stack ? <PanelStack panels={upper} region={region} /> : <Panes panels={upper} activeId={activeId} region={region} />}
    </>
  );

  const lowerFolded = useSelector((s) => !!s.layout?.folded[slotKey(region, 'bottom')]);

  return (
    <div
      class={cx('kb-region', `kb-region--${region}`, collapsed && 'is-collapsed', maximized && 'is-maximized', split && !collapsed && 'is-split')}
      style={style}
      hidden={hidden}
      data-region={region}
    >
      {collapsed && (
        <button type="button" class="kb-region__rail" title={`展开${name}`} onClick={toggle}>
          <Icon name={region === 'left' ? 'fold-right' : 'fold-left'} />
          <span class="kb-region__rail-title">{name}</span>
        </button>
      )}
      <div class="kb-region__inner" hidden={collapsed}>
        <section
          ref={upperRef}
          class="kb-region__group"
          style={split && !lowerFolded ? { flex: `${1 - ratio} 1 0px` } : undefined}
        >
          <header
            class="kb-region__header"
            data-kb-context="panel"
            data-kb-context-data={stack ? undefined : activeId}
            onDblClick={(e) => canMaximize && e.target === e.currentTarget && kernel.execute('layout.maximize', region)}
          >
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
          <div class="kb-region__body">{upperBody}</div>
        </section>
        {split && !lowerFolded && (
          <Resizer
            axis="y"
            class="kb-region__split"
            label={`调整${config.title}上下高度`}
            onStart={() => {
              drag.current = { top: upperRef.current?.offsetHeight ?? 0, bottom: lowerRef.current?.offsetHeight ?? 0 };
            }}
            onMove={(delta) => {
              const d = drag.current;
              const total = d ? d.top + d.bottom : 0;
              if (!d || total <= 0) return;
              kernel.dispatch(layoutActions.setSplit({ region, ratio: (d.bottom - delta) / total }));
            }}
            onReset={() => kernel.dispatch(layoutActions.resetSplit(region))}
          />
        )}
        {split && (
          // 下半区是独立的一组面板（与上半区之间留出间隔），可单独收起为标题栏
          <section
            ref={lowerRef}
            class={cx('kb-region__group', 'kb-region__lower', lowerFolded && 'is-folded')}
            style={lowerFolded ? undefined : { flex: `${ratio} 1 0px` }}
            data-slot="bottom"
          >
            <header class="kb-region__subheader" data-kb-context="panel" data-kb-context-data={lowerActiveId}>
              <IconButton
                icon={lowerFolded ? 'chevron-right' : 'chevron-down'}
                title={lowerFolded ? '展开' : '收起'}
                onClick={() => kernel.dispatch(layoutActions.toggleFolded(slotKey(region, 'bottom')))}
              />
              <div class="kb-region__heading">
                <GroupHeading
                  panels={lower}
                  active={lowerActiveId}
                  onChange={(panelId) => kernel.dispatch(layoutActions.setActive({ region, panelId, slot: 'bottom' }))}
                />
              </div>
              <div class="kb-region__tools">
                <PanelActions actions={lower.find((p) => p.id === lowerActiveId)?.actions} />
              </div>
            </header>
            <div class="kb-region__body" hidden={lowerFolded}>
              <Panes panels={lower} activeId={lowerActiveId} region={region} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** 一组面板的标题：单个面板显示标题，多个显示标签页 */
function GroupHeading({ panels, active, onChange }: { panels: readonly PanelContribution[]; active?: string; onChange: (id: string) => void }) {
  if (panels.length === 1) return <span class="kb-region__title">{panels[0]!.title}</span>;
  return <Tabs items={panels} active={active} onChange={onChange} />;
}

/** 标签页模式的面板内容：全部保持挂载，只隐藏非激活项 */
function Panes({ panels, activeId, region }: { panels: readonly PanelContribution[]; activeId?: string; region: RegionId }) {
  const kernel = useKernel();
  return (
    <>
      {panels.map((panel) => (
        <div key={panel.id} class="kb-region__pane" hidden={panel.id !== activeId}>
          <ViewHost view={panel.view} props={{ kernel, panelId: panel.id, region }} />
        </div>
      ))}
    </>
  );
}
