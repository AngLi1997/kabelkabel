import { clamp, type PanelContribution, type RegionId } from '@kabel/core';
import { useRef } from 'preact/hooks';
import { Resizer } from '../components/Resizer';
import { ViewHost } from '../components/ViewHost';
import { useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { layoutActions } from '../layout/layout-plugin';
import { cx } from '../utils';
import { PanelActions } from './PanelActions';

const MIN_HEIGHT = 72;

/** 上下堆叠的面板组：每个面板可折叠，相邻展开面板之间可拖拽调整高度 */
export function PanelStack({ panels, region }: { panels: readonly PanelContribution[]; region: RegionId }) {
  const kernel = useKernel();
  const weights = useSelector((s) => s.layout?.weights ?? {});
  const folded = useSelector((s) => s.layout?.folded ?? {});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const drag = useRef<{ ha: number; hb: number; wa: number; wb: number } | null>(null);
  const weightOf = (p: PanelContribution) => weights[p.id] ?? p.weight ?? 1;

  return (
    <div class="kb-stack">
      {panels.map((panel, index) => {
        const next = panels[index + 1];
        const isFolded = !!folded[panel.id];
        const resizable = next && !isFolded && !folded[next.id];
        return (
          <>
            <div
              key={panel.id}
              ref={(el) => {
                refs.current[panel.id] = el;
              }}
              class={cx('kb-stack__item', isFolded && 'is-folded')}
              style={{ flex: isFolded ? '0 0 auto' : `${weightOf(panel)} 1 0px` }}
            >
              <header class="kb-stack__header">
                <button
                  type="button"
                  class="kb-stack__toggle"
                  aria-expanded={!isFolded}
                  onClick={() => kernel.dispatch(layoutActions.toggleFolded(panel.id))}
                >
                  <Icon name={isFolded ? 'chevron-right' : 'chevron-down'} />
                  <span class="kb-stack__title">{panel.title}</span>
                </button>
                <PanelActions actions={panel.actions} />
              </header>
              <div class="kb-stack__body" hidden={isFolded}>
                <ViewHost view={panel.view} props={{ kernel, panelId: panel.id, region }} />
              </div>
            </div>
            {resizable && (
              <Resizer
                key={`${panel.id}-resizer`}
                axis="y"
                label={`调整${panel.title}高度`}
                onStart={() => {
                  drag.current = {
                    ha: refs.current[panel.id]?.offsetHeight ?? 0,
                    hb: refs.current[next.id]?.offsetHeight ?? 0,
                    wa: weightOf(panel),
                    wb: weightOf(next),
                  };
                }}
                onMove={(delta) => {
                  const d = drag.current;
                  if (!d) return;
                  const total = d.ha + d.hb;
                  if (total <= MIN_HEIGHT * 2) return;
                  const ha = clamp(d.ha + delta, MIN_HEIGHT, total - MIN_HEIGHT);
                  const sum = d.wa + d.wb;
                  kernel.dispatch(
                    layoutActions.setWeights({ [panel.id]: (sum * ha) / total, [next.id]: (sum * (total - ha)) / total }),
                  );
                }}
                onReset={() =>
                  kernel.dispatch(layoutActions.setWeights({ [panel.id]: panel.weight ?? 1, [next.id]: next.weight ?? 1 }))
                }
              />
            )}
          </>
        );
      })}
    </div>
  );
}
