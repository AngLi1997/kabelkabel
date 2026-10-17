import {
  clamp,
  createServiceToken,
  createSlice,
  debounce,
  definePlugin,
  ExtensionPoints,
  type KabelState,
  type Kernel,
  type PanelContribution,
  type PanelPlacement,
  type PanelSlot,
  type RegionId,
  type StatePredicate,
} from '@kabel/core';

export interface RegionConfig {
  /** 区域名称：折叠条、按钮提示与窄屏切换标签使用；面板标题由面板自身提供 */
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
  /** 存在下半区面板（`slot: 'bottom'`）时，下半区默认所占高度比例，默认 0.5 */
  split: number;
}

export type RegionOptions = Partial<RegionConfig>;

export interface LayoutOptions {
  regions?: Partial<Record<RegionId, RegionOptions>>;
  /**
   * 面板摆放（按面板 id）：覆盖面板贡献与摆放贡献中的默认位置，如
   * `{ 'workspace.files': { region: 'right' }, 'table.materials': { region: 'left', slot: 'bottom' } }`。
   * 用户经右键菜单 / `layout.movePanel` 的调整优先于这里。
   */
  panels?: Record<string, PanelPlacement>;
  /** 是否持久化布局状态，默认 true */
  persist?: boolean;
}

export type LayoutConfig = Record<RegionId, RegionConfig>;

export interface LayoutState {
  sizes: { left: number; right: number };
  collapsed: { left: boolean; right: boolean };
  maximized: RegionId | null;
  /** 标签页模式下各区域（下半区为 `<region>.bottom`）的激活面板，键见 `slotKey` */
  active: Record<string, string>;
  /** 各区域下半区所占高度比例，未设置时取 `RegionConfig.split` */
  splits: Partial<Record<RegionId, number>>;
  /** 堆叠模式下各面板高度权重 */
  weights: Record<string, number>;
  /** 用户调整过的面板位置（`layout.movePanel`），优先于其他摆放来源 */
  placements: Record<string, PanelPlacement>;
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
  left: { title: '左侧面板', size: 280, min: 200, max: 560, collapsed: false, mode: 'tabs', collapsible: true, split: 0.5 },
  main: { title: '内容', size: 0, min: 360, max: Infinity, collapsed: false, mode: 'tabs', collapsible: false, split: 0.4 },
  right: { title: '右侧面板', size: 360, min: 260, max: 640, collapsed: false, mode: 'tabs', collapsible: true, split: 0.5 },
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
    splits: {},
    placements: {},
    weights: {},
    folded: {},
    compactRegion: 'main',
    breakpoint: 'lg',
    overlay: false,
  };
}

/** 下半区比例的取值范围 */
export const SPLIT_RANGE = { min: 0.15, max: 0.85 } as const;

/** 激活面板的状态键：主区为区域名，下半区为 `<region>.bottom` */
export const slotKey = (region: RegionId, slot: PanelSlot = 'top') => (slot === 'bottom' ? `${region}.bottom` : region);

/** 中等宽度下右侧区域不挤占内容区，改为浮层 */
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
      setActive: (s: LayoutState, p: { region: RegionId; panelId: string; slot?: PanelSlot }) => {
        const key = slotKey(p.region, p.slot);
        return s.active[key] === p.panelId ? s : { ...s, active: { ...s.active, [key]: p.panelId } };
      },
      setSplit: (s: LayoutState, p: { region: RegionId; ratio: number }) => {
        const ratio = Math.round(clamp(p.ratio, SPLIT_RANGE.min, SPLIT_RANGE.max) * 1000) / 1000;
        return s.splits[p.region] === ratio ? s : { ...s, splits: { ...s.splits, [p.region]: ratio } };
      },
      resetSplit: (s: LayoutState, region: RegionId) => {
        if (s.splits[region] === undefined) return s;
        const { [region]: _, ...splits } = s.splits;
        return { ...s, splits };
      },
      /** 用户调整面板位置（与已有调整合并） */
      place: (s: LayoutState, p: { panelId: string; placement: PanelPlacement }) => ({
        ...s,
        placements: { ...s.placements, [p.panelId]: { ...s.placements[p.panelId], ...p.placement } },
      }),
      /** 恢复面板的默认位置；不传 id 时恢复全部 */
      unplace: (s: LayoutState, panelId?: string) => {
        if (panelId === undefined) return Object.keys(s.placements).length ? { ...s, placements: {} } : s;
        if (!s.placements[panelId]) return s;
        const { [panelId]: _, ...placements } = s.placements;
        return { ...s, placements };
      },
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
    splits: Object.fromEntries(
      Object.entries(record<number>(saved.splits, (x) => typeof x === 'number' && Number.isFinite(x))).filter(([k]) => region(k)).map(([k, v]) => [k, clamp(v, SPLIT_RANGE.min, SPLIT_RANGE.max)]),
    ),
    placements: Object.fromEntries(
      Object.entries(record<PanelPlacement>(saved.placements, (x) => !!x && typeof x === 'object'))
        .map(([id, p]) => [id, sanitizePlacement(p)] as const)
        .filter(([, p]) => Object.keys(p).length > 0),
    ),
    weights: record<number>(saved.weights, (x) => typeof x === 'number' && Number.isFinite(x) && x > 0),
    folded: record<boolean>(saved.folded, (x) => typeof x === 'boolean'),
    compactRegion: region(saved.compactRegion) ?? base.compactRegion,
    breakpoint: base.breakpoint,
    overlay: false,
  };
}

export const LAYOUT_CONFIG = createServiceToken<LayoutConfig>('kabel.layout.config');
/** 宿主在 `LayoutOptions.panels` 中声明的面板摆放 */
export const LAYOUT_PANELS = createServiceToken<Readonly<Record<string, PanelPlacement>>>('kabel.layout.panels');

const REGION_IDS: readonly RegionId[] = ['left', 'main', 'right'];

/** 只保留合法的摆放字段 */
export function sanitizePlacement(input: unknown): PanelPlacement {
  if (!input || typeof input !== 'object') return {};
  const p = input as Record<string, unknown>;
  const out: PanelPlacement = {};
  if (REGION_IDS.includes(p.region as RegionId)) out.region = p.region as RegionId;
  if (p.slot === 'top' || p.slot === 'bottom') out.slot = p.slot;
  if (typeof p.order === 'number' && Number.isFinite(p.order)) out.order = p.order;
  if (typeof p.title === 'string' && p.title) out.title = p.title;
  return out;
}

/**
 * 面板的实际摆放：用户调整 > 宿主 `layout.panels` > 摆放贡献 `ExtensionPoints.placements` > 面板贡献自身。
 * 返回按（摆放后的）`order` 排序的面板；未被调整的面板保持原对象。
 */
export function resolvePanels(
  kernel: Kernel,
  state: KabelState,
  panels: readonly PanelContribution[] = kernel.extensions.get(ExtensionPoints.panels).getAll(),
): PanelContribution[] {
  const contributed = kernel.extensions.get(ExtensionPoints.placements);
  const host = kernel.services.tryGet(LAYOUT_PANELS) ?? {};
  const user = state.layout?.placements ?? {};
  const placed = panels.map((panel, index) => {
    const item = contributed.get(panel.id);
    const merged = {
      ...(item && sanitizePlacement(item)),
      ...sanitizePlacement(host[panel.id]),
      ...sanitizePlacement(user[panel.id]),
    };
    return { panel: Object.keys(merged).length ? { ...panel, ...merged } : panel, index };
  });
  return placed.sort((a, b) => (a.panel.order ?? 100) - (b.panel.order ?? 100) || a.index - b.index).map((x) => x.panel);
}

/** 单个面板的实际摆放 */
export const resolvePanel = (kernel: Kernel, state: KabelState, panelId: string): PanelContribution | undefined => {
  const panel = kernel.extensions.get(ExtensionPoints.panels).get(panelId);
  return panel && resolvePanels(kernel, state, [panel])[0];
};

const STORAGE_KEY = 'state.v1';

export type LayoutSlice = ReturnType<typeof createLayoutSlice>;
export const layoutActions = createLayoutSlice(DEFAULT_LAYOUT_CONFIG).actions;

/** 布局插件：三栏尺寸、折叠、最大化、标签/堆叠状态及其持久化 */
export const layoutPlugin = (options: LayoutOptions = {}) =>
  definePlugin({
    name: 'kabel:layout',
    title: '布局',
    builtin: true,
    setup(ctx) {
      const config = resolveLayoutConfig(options);
      const slice = createLayoutSlice(config);
      const persist = options.persist !== false;
      const saved = persist ? ctx.storage.get<Partial<LayoutState> | null>(STORAGE_KEY, null) : null;
      ctx.registerSlice(slice, sanitize(slice.getInitialState(), saved, config));
      ctx.provide(LAYOUT_CONFIG, config);
      ctx.provide(LAYOUT_PANELS, Object.fromEntries(Object.entries(options.panels ?? {}).map(([id, p]) => [id, sanitizePlacement(p)])));

      if (persist) {
        const save = debounce((state: LayoutState) => ctx.storage.set(STORAGE_KEY, state), 200);
        ctx.watch((s) => s.layout, save);
        ctx.onDispose(() => save.flush());
      }

      const layout = (k: Kernel) => k.getState().layout;
      const toggleCommand = (side: Side) => ({
        id: side === 'left' ? 'layout.toggleLeft' : 'layout.toggleRight',
        title: `显示/隐藏${config[side].title}`,
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
        hidden: true,
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
        hidden: true,
        title: '显示区域',
        run: (k, region: RegionId) => k.dispatch(slice.actions.reveal(region)),
      });
      ctx.registerCommand({
        id: 'layout.showPanel',
        hidden: true,
        title: '显示面板',
        run: (k, panelId: string) => {
          const panel = resolvePanel(k, k.getState(), panelId);
          if (!panel) return;
          k.dispatch(slice.actions.reveal(panel.region));
          k.dispatch(slice.actions.setActive({ region: panel.region, panelId, slot: panel.slot }));
        },
      });
      ctx.registerCommand({
        id: 'layout.movePanel',
        hidden: true,
        title: '移动面板',
        run: (k, panelId: string, placement: PanelPlacement) => {
          if (!k.extensions.get(ExtensionPoints.panels).get(panelId)) return;
          k.dispatch(slice.actions.place({ panelId, placement: sanitizePlacement(placement) }));
          return k.execute('layout.showPanel', panelId);
        },
      });
      ctx.registerCommand({
        id: 'layout.resetPanel',
        hidden: true,
        title: '恢复面板默认位置',
        run: (k, panelId?: string) => k.dispatch(slice.actions.unplace(panelId)),
      });
      ctx.registerCommand({
        id: 'layout.reset',
        title: '重置布局',
        run: (k) => k.dispatch(slice.actions.reset()),
      });

      // 区域内没有任何面板时整个区域不渲染，对应的开关按钮也一并隐藏
      const hasPanels = (side: Side): StatePredicate => (s, k) =>
        resolvePanels(k, s).some((p) => p.region === side && (!p.when || p.when(s, k)));
      ctx.contribute(
        ExtensionPoints.toolbar,
        { id: 'layout.toggleLeft', group: 'end', icon: 'panel-left', tooltip: `显示/隐藏${config.left.title}`, command: 'layout.toggleLeft', order: 900, when: hasPanels('left') },
        { id: 'layout.toggleRight', group: 'end', icon: 'panel-right', tooltip: `显示/隐藏${config.right.title}`, command: 'layout.toggleRight', order: 910, when: hasPanels('right') },
        { id: 'layout.reset', group: 'end', icon: 'layout', tooltip: '重置布局', command: 'layout.reset', order: 920 },
      );

      // 表单配置：区域配置、宿主摆放、用户调整与当前生效的面板位置
      ctx.contribute(ExtensionPoints.formConfig, {
        id: 'layout',
        title: '布局',
        order: 10,
        collect: (k) => {
          const s = k.getState();
          const { breakpoint: _b, overlay: _o, ...state } = s.layout;
          return {
            regions: config,
            panels: k.services.tryGet(LAYOUT_PANELS) ?? {},
            state,
            placed: resolvePanels(k, s).map((p) => ({
              id: p.id,
              title: p.title,
              region: p.region,
              slot: p.slot ?? 'top',
              order: p.order ?? 100,
              ...(p.when && !p.when(s, k) ? { visible: false } : {}),
            })),
          };
        },
      });

      // 面板头部右键：移动到其他区域 / 上下分区，或恢复默认位置（`data-kb-context="panel"`，数据为面板 id）
      const targets: { id: string; label: string; placement: Required<Pick<PanelPlacement, 'region' | 'slot'>> }[] = [
        { id: 'left', label: '移到左侧', placement: { region: 'left', slot: 'top' } },
        { id: 'left.bottom', label: '移到左侧下方', placement: { region: 'left', slot: 'bottom' } },
        { id: 'right', label: '移到右侧', placement: { region: 'right', slot: 'top' } },
        { id: 'right.bottom', label: '移到右侧下方', placement: { region: 'right', slot: 'bottom' } },
      ];
      const placedOf = (s: KabelState, k: Kernel, data?: string) => (data ? resolvePanel(k, s, data) : undefined);
      ctx.contribute(
        ExtensionPoints.contextMenu,
        ...targets.map((t, i) => ({
          id: `layout.movePanel.${t.id}`,
          target: 'panel',
          group: 'layout',
          order: 900 + i,
          label: t.label,
          icon: t.placement.region === 'left' ? 'panel-left' : 'panel-right',
          when: (s: KabelState, k: Kernel, c: { data?: string }) => {
            const p = placedOf(s, k, c.data);
            return !!p && p.region !== 'main' && (p.region !== t.placement.region || (p.slot ?? 'top') !== t.placement.slot);
          },
          onClick: (k: Kernel, c: { data?: string }) => c.data && k.execute('layout.movePanel', c.data, t.placement),
        })),
        {
          id: 'layout.resetPanel',
          target: 'panel',
          group: 'layout',
          order: 910,
          label: '恢复默认位置',
          icon: 'reset',
          when: (s, _k, c) => !!c.data && !!s.layout?.placements[c.data],
          onClick: (k, c) => c.data && k.execute('layout.resetPanel', c.data),
        },
      );
    },
  });
