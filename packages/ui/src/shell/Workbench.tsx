import { clamp, ExtensionPoints, matchKeybinding, type Kernel, type PanelContribution, type RegionId } from '@kabel/core';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { Resizer } from '../components/Resizer';
import { KernelContext, UiConfigContext, type UiConfig } from '../context';
import { breakpointOf, useContributions, useElementSize, useKernel, useMediaQuery, useSelector } from '../hooks';
import {
  createInitialLayout,
  DEFAULT_LAYOUT_CONFIG,
  isOverlayMode,
  isRegionCollapsed,
  LAYOUT_CONFIG,
  layoutActions,
} from '../layout/layout-plugin';
import { SettingsDialog } from '../settings/SettingsDialog';
import { themeRootProps } from '../theme/theme-plugin';
import { cx } from '../utils';
import { Region } from './Region';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

export interface WorkbenchProps {
  kernel: Kernel;
  ui?: UiConfig;
  class?: string;
}

export function Workbench({ kernel, ui = { icons: {} }, class: className }: WorkbenchProps) {
  return (
    <KernelContext.Provider value={kernel}>
      <UiConfigContext.Provider value={ui}>
        <Shell class={className} />
      </UiConfigContext.Provider>
    </KernelContext.Provider>
  );
}

const RAIL_WIDTH = 28;
const REGIONS: RegionId[] = ['left', 'main', 'right'];
const fallbackLayout = createInitialLayout(DEFAULT_LAYOUT_CONFIG);

const isEditable = (target: EventTarget | null) =>
  target instanceof Element && (target.matches('input, textarea, select') || (target as HTMLElement).isContentEditable);

/** 执行匹配快捷键的命令，返回是否已处理。输入框内不响应无修饰键的快捷键（如数字、Delete）。 */
function dispatchKeybinding(kernel: Kernel, event: KeyboardEvent): boolean {
  const editing = isEditable(event.target);
  for (const command of kernel.commands.list()) {
    let bindings = command.keybinding ? [command.keybinding].flat() : [];
    if (editing) bindings = bindings.filter((b) => /(^|\+)(mod|ctrl|control|cmd|meta|alt|option)\+/i.test(b));
    if (!bindings.some((b) => matchKeybinding(event, b))) continue;
    if (!kernel.commands.isEnabled(command.id)) continue;
    event.preventDefault();
    kernel.execute(command.id).catch((error) => kernel.bus.emit('error', { error, source: command.id }));
    return true;
  }
  return false;
}

function Shell({ class: className }: { class?: string }) {
  const kernel = useKernel();
  const root = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(root);
  const breakpoint = breakpointOf(width);
  const compact = breakpoint === 'sm';
  const config = kernel.services.tryGet(LAYOUT_CONFIG) ?? DEFAULT_LAYOUT_CONFIG;
  const layout = useSelector((s) => s.layout ?? fallbackLayout);
  const hasLayout = useSelector((s) => !!s.layout);
  const theme = useSelector((s) => s.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', theme?.scheme === 'system');

  const allPanels = useContributions(ExtensionPoints.panels);
  const visibleKey = useSelector((s) => allPanels.filter((p) => !p.when || p.when(s, kernel)).map((p) => p.id).join('|'));
  const panelsByRegion = useMemo(() => {
    const ids = new Set(visibleKey.split('|'));
    const map: Record<RegionId, PanelContribution[]> = { left: [], main: [], right: [] };
    for (const panel of allPanels) if (ids.has(panel.id)) map[panel.region].push(panel);
    return map;
  }, [allPanels, visibleKey]);

  // 断点回写到布局状态，命令据此决定“收起”还是“关闭浮层”
  useEffect(() => {
    if (hasLayout && width) kernel.dispatch(layoutActions.setBreakpoint(breakpoint));
  }, [kernel, breakpoint, hasLayout, width]);

  // 快捷键作用域：事件目标在工作台内，或焦点在 body 且最近一次指针/焦点交互发生在工作台内。
  // 不在工作台内交互时不拦截宿主页面的任何按键。
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const doc = el.ownerDocument;
    let engaged = false;
    const onPointer = (event: Event) => {
      const target = event.target as Node;
      engaged = el.contains(target);
      // 点击浮层之外的区域时关闭右侧浮层
      const state = kernel.getState().layout;
      if (state?.overlay && isOverlayMode(state)) {
        const right = el.querySelector('[data-region="right"]');
        const body = el.querySelector('.kb-body');
        if (right && body?.contains(target) && !right.contains(target)) kernel.dispatch(layoutActions.setOverlay(false));
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as Node;
      const idle = target === doc.body || target === doc.documentElement;
      if (el.contains(target) || (idle && engaged)) dispatchKeybinding(kernel, event);
    };
    doc.addEventListener('pointerdown', onPointer, true);
    doc.addEventListener('focusin', onPointer, true);
    doc.addEventListener('keydown', onKey);
    return () => {
      doc.removeEventListener('pointerdown', onPointer, true);
      doc.removeEventListener('focusin', onPointer, true);
      doc.removeEventListener('keydown', onKey);
    };
  }, [kernel]);

  const { sizes, maximized, compactRegion } = layout;
  const present = (r: RegionId) => r === 'main' || panelsByRegion[r].length > 0;
  const overlayRight = breakpoint === 'md';
  const collapsed = (r: RegionId) => isRegionCollapsed({ ...layout, breakpoint }, r, config);

  // 实际宽度：保证中间区域不小于其最小宽度
  const occupied = (r: 'left' | 'right') =>
    !present(r) ? 0 : collapsed(r) || (r === 'right' && overlayRight) ? RAIL_WIDTH : sizes[r];
  const fit = (r: 'left' | 'right') => {
    const other = occupied(r === 'left' ? 'right' : 'left');
    const room = width ? width - other - config.main.min : Infinity;
    return clamp(sizes[r], config[r].min, Math.max(config[r].min, Math.min(config[r].max, room)));
  };

  const resizeStart = useRef(0);
  const resizer = (side: 'left' | 'right') => (
    <Resizer
      axis="x"
      label={`调整${config[side].title}宽度`}
      onStart={() => {
        resizeStart.current = fit(side);
      }}
      onMove={(delta) =>
        kernel.dispatch(layoutActions.setSize({ region: side, size: resizeStart.current + (side === 'left' ? delta : -delta) }))
      }
      onReset={() => kernel.dispatch(layoutActions.setSize({ region: side, size: config[side].size }))}
    />
  );

  const hiddenBy = (r: RegionId) => (compact ? r !== compactRegion : maximized !== null && maximized !== r);
  const style = (r: 'left' | 'right') => (collapsed(r) || compact || maximized ? undefined : { width: `${fit(r)}px` });
  const showResizer = (r: 'left' | 'right') =>
    !compact && !maximized && present(r) && !collapsed(r) && !(r === 'right' && overlayRight);
  const region = (r: RegionId) => (
    <Region
      region={r}
      config={config[r]}
      panels={panelsByRegion[r]}
      compact={compact}
      collapsed={collapsed(r)}
      hidden={hiddenBy(r)}
      style={r === 'main' ? undefined : style(r)}
    />
  );

  return (
    <div
      ref={root}
      class={cx('kb-root', className, maximized && 'is-maximized')}
      data-size={breakpoint}
      {...themeRootProps(theme, prefersDark)}
    >
      <Toolbar breakpoint={breakpoint} />
      {compact && (
        <div class="kb-switcher" role="tablist">
          {REGIONS.filter(present).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === compactRegion}
              class={cx('kb-switcher__item', r === compactRegion && 'is-active')}
              onClick={() => kernel.dispatch(layoutActions.setCompactRegion(r))}
            >
              {config[r].title}
            </button>
          ))}
        </div>
      )}
      <div class={cx('kb-body', overlayRight && 'is-overlay-right')}>
        {present('left') && region('left')}
        {showResizer('left') && resizer('left')}
        {region('main')}
        {showResizer('right') && resizer('right')}
        {present('right') && region('right')}
      </div>
      <StatusBar />
      <SettingsDialog />
    </div>
  );
}
