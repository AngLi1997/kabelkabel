import {
  clamp,
  createServiceToken,
  createSlice,
  debounce,
  definePlugin,
  ExtensionPoints,
  type Kernel,
  type RegionId,
} from '@kabel/core';

export interface RegionConfig {
  /** 区域标题（堆叠模式或无面板时显示） */
  title: string;
  /** 默认宽度（px），仅左右区域有效 */
  size: number;
  min: number;
  max: number;
  /** 默认是否折叠 */
  collapsed: boolean;
  /** 多个面板的组织方式：标签页或上下堆叠（可调高度） */
  mode: 'tabs' | 'stack';
  collapsible: boolean;
}

export type RegionOptions = Partial<RegionConfig>;

export interface LayoutOptions {
  regions?: Partial<Record<RegionId, RegionOptions>>;
  /** 是否持久化布局状态，默认 true */
  persist?: boolean;
}

export type LayoutConfig = Record<RegionId, RegionConfig>;

export interface LayoutState {
  sizes: { left: number; right: number };
  collapsed: { left: boolean; right: boolean };
  maximized: RegionId | null;
  /** 标签页模式下各区域的激活面板 */
  active: Partial<Record<RegionId, string>>;
  /** 堆叠模式下各面板高度权重 */
  weights: Record<string, number>;
  /** 堆叠模式下各面板折叠状态 */
  folded: Record<string, boolean>;
  /** 窄屏单栏模式下显示的区域 */
  compactRegion: RegionId;
  /** 当前容器断点（由渲染层回写，不持久化） */
  breakpoint: Breakpoint;
  /** 中等宽度下右侧区域以浮层展开（不持久化） */
  overlay: boolean;
}

export type Breakpoint = 'sm' | 'md' | 'lg';

declare module '@kabel/core' {
  interface KabelState {
    layout: LayoutState;
  }
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  left: { title: '影像', size: 380, min: 220, max: 760, collapsed: false, mode: 'tabs', collapsible: true },
  main: { title: '著录信息', size: 0, min: 360, max: Infinity, collapsed: false, mode: 'tabs', collapsible: false },
  right: { title: '辅助信息', size: 300, min: 240, max: 560, collapsed: false, mode: 'stack', collapsible: true },
};

export function resolveLayoutConfig(options: LayoutOptions = {}): LayoutConfig {
  const regions = options.regions ?? {};
  return {
    left: { ...DEFAULT_LAYOUT_CONFIG.left, ...regions.left },
    main: { ...DEFAULT_LAYOUT_CONFIG.main, ...regions.main, collapsible: false },
    right: { ...DEFAULT_LAYOUT_CONFIG.right, ...regions.right },
  };
}

export function createInitialLayout(config: LayoutConfig): LayoutState {
  return {
    sizes: { left: config.left.size, right: config.right.size },
    collapsed: { left: config.left.collapsed, right: config.right.collapsed },
    maximized: null,
    active: {},
    weights: {},
    folded: {},
    compactRegion: 'main',
    breakpoint: 'lg',
    overlay: false,
  };
}

/** 中等宽度下右侧区域不挤占著录区，改为浮层 */
export const isOverlayMode = (s: LayoutState) => s.breakpoint === 'md';

/** 区域在当前断点下是否处于收起状态 */
export function isRegionCollapsed(s: LayoutState, region: RegionId, config: LayoutConfig): boolean {
  if (region === 'main' || !config[region].collapsible || s.breakpoint === 'sm') return false;
  if (region === 'right' && isOverlayMode(s)) return !s.overlay;
  return s.collapsed[region];
}

type Side = 'left' | 'right';

export function createLayoutSlice(config: LayoutConfig) {
  const initial = createInitialLayout(config);
  return createSlice({
    name: 'layout',
    initialState: initial,
    reducers: {
      setSize: (s: LayoutState, p: { region: Side; size: number }) => {
        const c = config[p.region];
        const size = Math.round(clamp(p.size, c.min, c.max));
        return size === s.sizes[p.region] ? s : { ...s, sizes: { ...s.sizes, [p.region]: size } };
      },
      setCollapsed: (s: LayoutState, p: { region: Side; collapsed: boolean }) =>
        p.region === 'right' && isOverlayMode(s)
          ? { ...s, overlay: !p.collapsed }
          : s.collapsed[p.region] === p.collapsed
          ? s
          : {
              ...s,
              collapsed: { ...s.collapsed, [p.region]: p.collapsed },
              maximized: p.collapsed && s.maximized === p.region ? null : s.maximized,
            },
      toggle: (s: LayoutState, region: Side) =>
        region === 'right' && isOverlayMode(s)
          ? { ...s, overlay: !s.overlay, maximized: null }
          : { ...s, collapsed: { ...s.collapsed, [region]: !s.collapsed[region] }, maximized: null },
      setBreakpoint: (s: LayoutState, breakpoint: Breakpoint) =>
        s.breakpoint === breakpoint ? s : { ...s, breakpoint, overlay: false },
      setOverlay: (s: LayoutState, overlay: boolean) => (s.overlay === overlay ? s : { ...s, overlay }),
      maximize: (s: LayoutState, region: RegionId | null) => (s.maximized === region ? s : { ...s, maximized: region }),
      toggleMaximize: (s: LayoutState, region: RegionId) => ({ ...s, maximized: s.maximized === region ? null : region }),
      setActive: (s: LayoutState, p: { region: RegionId; panelId: string }) =>
        s.active[p.region] === p.panelId ? s : { ...s, active: { ...s.active, [p.region]: p.panelId } },
      setWeights: (s: LayoutState, weights: Record<string, number>) => ({ ...s, weights: { ...s.weights, ...weights } }),
      toggleFolded: (s: LayoutState, panelId: string) => ({ ...s, folded: { ...s.folded, [panelId]: !s.folded[panelId] } }),
      setCompactRegion: (s: LayoutState, region: RegionId) => (s.compactRegion === region ? s : { ...s, compactRegion: region }),
      /** 确保区域可见：展开、切换窄屏区域、退出其他区域的最大化 */
      reveal: (s: LayoutState, region: RegionId) => ({
        ...s,
        collapsed: region === 'main' || (region === 'right' && isOverlayMode(s)) ? s.collapsed : { ...s.collapsed, [region]: false },
        overlay: region === 'right' && isOverlayMode(s) ? true : s.overlay,
        maximized: s.maximized && s.maximized !== region ? null : s.maximized,
        compactRegion: region,
      }),
      reset: (s: LayoutState) => ({ ...initial, breakpoint: s.breakpoint }),
      hydrate: (s: LayoutState, saved: Partial<LayoutState>) => sanitize(s, saved, config),
    },
  });
}

/** 合并持久化数据，丢弃非法值，避免存储被篡改或版本变化导致布局错乱 */
export function sanitize(base: LayoutState, saved: Partial<LayoutState> | null | undefined, config: LayoutConfig): LayoutState {
  if (!saved || typeof saved !== 'object') return base;
  const num = (v: unknown, side: Side) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, config[side].min, config[side].max)) : base.sizes[side];
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const region = (v: unknown): RegionId | null => (v === 'left' || v === 'main' || v === 'right' ? v : null);
  const record = <T>(v: unknown, check: (x: unknown) => boolean): Record<string, T> => {
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(Object.entries(v).filter(([, x]) => check(x))) as Record<string, T>;
  };
  return {
    sizes: { left: num(saved.sizes?.left, 'left'), right: num(saved.sizes?.right, 'right') },
    collapsed: {
      left: config.left.collapsible && bool(saved.collapsed?.left, base.collapsed.left),
      right: config.right.collapsible && bool(saved.collapsed?.right, base.collapsed.right),
    },
    maximized: region(saved.maximized),
    active: record<string>(saved.active, (x) => typeof x === 'string'),
    weights: record<number>(saved.weights, (x) => typeof x === 'number' && Number.isFinite(x) && x > 0),
    folded: record<boolean>(saved.folded, (x) => typeof x === 'boolean'),
    compactRegion: region(saved.compactRegion) ?? base.compactRegion,
    breakpoint: base.breakpoint,
    overlay: false,
  };
}

export const LAYOUT_CONFIG = createServiceToken<LayoutConfig>('kabel.layout.config');

const STORAGE_KEY = 'state.v1';

export type LayoutSlice = ReturnType<typeof createLayoutSlice>;
export const layoutActions = createLayoutSlice(DEFAULT_LAYOUT_CONFIG).actions;

/** 布局插件：三栏尺寸、折叠、最大化、标签/堆叠状态及其持久化 */
export const layoutPlugin = (options: LayoutOptions = {}) =>
  definePlugin({
    name: 'kabel:layout',
    setup(ctx) {
      const config = resolveLayoutConfig(options);
      const slice = createLayoutSlice(config);
      const persist = options.persist !== false;
      const saved = persist ? ctx.storage.get<Partial<LayoutState> | null>(STORAGE_KEY, null) : null;
      ctx.registerSlice(slice, sanitize(slice.getInitialState(), saved, config));
      ctx.provide(LAYOUT_CONFIG, config);

      if (persist) {
        const save = debounce((state: LayoutState) => ctx.storage.set(STORAGE_KEY, state), 200);
        ctx.watch((s) => s.layout, save);
        ctx.onDispose(() => save.flush());
      }

      const layout = (k: Kernel) => k.getState().layout;
      const toggleCommand = (side: Side) => ({
        id: side === 'left' ? 'layout.toggleLeft' : 'layout.toggleRight',
        title: side === 'left' ? '左侧区域' : '右侧区域',
        enabled: () => config[side].collapsible,
        checked: (k: Kernel) => !isRegionCollapsed(layout(k), side, config),
        run: (k: Kernel, collapsed?: boolean) =>
          k.dispatch(
            typeof collapsed === 'boolean'
              ? slice.actions.setCollapsed({ region: side, collapsed })
              : slice.actions.toggle(side),
          ),
      });
      ctx.registerCommand(toggleCommand('left'));
      ctx.registerCommand(toggleCommand('right'));
      ctx.registerCommand({
        id: 'layout.maximize',
        title: '最大化',
        run: (k, region: RegionId) => k.dispatch(slice.actions.toggleMaximize(region)),
      });
      ctx.registerCommand({
        id: 'layout.restore',
        title: '还原',
        keybinding: 'Escape',
        enabled: (k) => layout(k).maximized !== null,
        run: (k) => k.dispatch(slice.actions.maximize(null)),
      });
      ctx.registerCommand({
        id: 'layout.reveal',
        title: '显示区域',
        run: (k, region: RegionId) => k.dispatch(slice.actions.reveal(region)),
      });
      ctx.registerCommand({
        id: 'layout.reset',
        title: '重置布局',
        run: (k) => k.dispatch(slice.actions.reset()),
      });

      ctx.contribute(
        ExtensionPoints.toolbar,
        { id: 'layout.toggleLeft', group: 'end', icon: 'panel-left', tooltip: `显示/隐藏${config.left.title}`, command: 'layout.toggleLeft', order: 900 },
        { id: 'layout.toggleRight', group: 'end', icon: 'panel-right', tooltip: `显示/隐藏${config.right.title}`, command: 'layout.toggleRight', order: 910 },
        { id: 'layout.reset', group: 'end', icon: 'layout', tooltip: '重置布局', command: 'layout.reset', order: 920 },
      );
    },
  });
