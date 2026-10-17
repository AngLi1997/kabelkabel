import { clamp, ExtensionPoints, type DrawerContribution } from '@kabel/core';
import { useRef, useState } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { Resizer } from '../components/Resizer';
import { ViewHost } from '../components/ViewHost';
import { useContributions, useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { PanelActions } from './PanelActions';

const MIN_WIDTH = 260;
const MAX_WIDTH = 960;

/** 工作台最右侧的抽屉栏（扩展点 `ExtensionPoints.drawers`）：`when` 为真的抽屉依次展开，可拖动调整宽度 */
export function Drawers({ overlay }: { overlay: boolean }) {
  const kernel = useKernel();
  const all = useContributions(ExtensionPoints.drawers);
  const visible = useSelector((s) => all.filter((d) => d.when(s, kernel)).map((d) => d.id).join('|'));
  const ids = visible ? visible.split('|') : [];
  const drawers = all.filter((d) => ids.includes(d.id));
  return (
    <>
      {drawers.map((drawer) => (
        <Drawer key={drawer.id} drawer={drawer} overlay={overlay} />
      ))}
    </>
  );
}

function Drawer({ drawer, overlay }: { drawer: DrawerContribution; overlay: boolean }) {
  const kernel = useKernel();
  const initial = drawer.width ?? 380;
  const [width, setWidth] = useState(initial);
  const start = useRef(width);
  const close = () => void drawer.close(kernel);
  return (
    <>
      {!overlay && (
        <Resizer
          axis="x"
          label={`调整${drawer.title}宽度`}
          onStart={() => {
            start.current = width;
          }}
          onMove={(delta) => setWidth(clamp(start.current - delta, MIN_WIDTH, MAX_WIDTH))}
          onReset={() => setWidth(initial)}
        />
      )}
      <aside
        class="kb-drawer"
        data-drawer={drawer.id}
        style={overlay ? undefined : { width: `${width}px` }}
        aria-label={drawer.title}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || e.defaultPrevented) return;
          e.preventDefault();
          close();
        }}
      >
        <header class="kb-drawer__header">
          {drawer.icon && <Icon name={drawer.icon} />}
          <span class="kb-drawer__title">{drawer.title}</span>
          <div class="kb-region__tools">
            <PanelActions actions={drawer.actions} />
            <IconButton icon="close" title={`关闭${drawer.title}`} onClick={close} />
          </div>
        </header>
        <div class="kb-drawer__body">
          <ViewHost view={drawer.view} props={{ kernel, drawerId: drawer.id }} />
        </div>
      </aside>
    </>
  );
}
