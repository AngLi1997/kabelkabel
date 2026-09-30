import { createServiceToken, createSlice, definePlugin, ExtensionPoints } from '@kabel/core';
import type { JSX } from 'preact';
import { ThemePage } from './ThemePage';

export type ColorScheme = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'standard' | 'comfortable';

export interface ThemeState {
  scheme: ColorScheme;
  /** 主题色（CSS 颜色），为空时使用令牌中的默认主色 */
  accent: string | null;
  density: Density;
  fontSize: number;
}

export interface ThemeAccent {
  title: string;
  color: string;
}

export interface ThemeOptions {
  /** 初始主题（无持久化数据时生效） */
  defaults?: Partial<ThemeState>;
  /** 可选主题色，默认一组克制的档案风格色 */
  accents?: ThemeAccent[];
  /** 是否持久化，默认 true */
  persist?: boolean;
}

declare module '@kabel/core' {
  interface KabelState {
    theme: ThemeState;
  }
}

export const DEFAULT_THEME: ThemeState = { scheme: 'light', accent: null, density: 'standard', fontSize: 13 };

export const DEFAULT_ACCENTS: ThemeAccent[] = [
  { title: '藏青', color: '#1f4e8c' },
  { title: '绛红', color: '#a4262c' },
  { title: '墨绿', color: '#2d6a4f' },
  { title: '黛青', color: '#1d6470' },
  { title: '赭石', color: '#8a5a2b' },
  { title: '玄灰', color: '#3d4756' },
];

export const FONT_SIZES = [12, 13, 14] as const;

export const THEME_ACCENTS = createServiceToken<ThemeAccent[]>('kabel.theme.accents');

/** 合并持久化数据，丢弃非法值 */
export function sanitizeTheme(base: ThemeState, saved: Partial<ThemeState> | null | undefined): ThemeState {
  if (!saved || typeof saved !== 'object') return base;
  const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    scheme: pick(saved.scheme, ['light', 'dark', 'system'] as const, base.scheme),
    accent: typeof saved.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(saved.accent) ? saved.accent : saved.accent === null ? null : base.accent,
    density: pick(saved.density, ['compact', 'standard', 'comfortable'] as const, base.density),
    fontSize: pick(saved.fontSize, FONT_SIZES as readonly number[], base.fontSize),
  };
}

export function createThemeSlice(initial: ThemeState) {
  return createSlice({
    name: 'theme',
    initialState: initial,
    reducers: {
      set: (s: ThemeState, patch: Partial<ThemeState>) => {
        const next = sanitizeTheme(s, { ...s, ...patch });
        return (Object.keys(next) as (keyof ThemeState)[]).every((k) => next[k] === s[k]) ? s : next;
      },
      reset: () => initial,
    },
  });
}

export const themeActions = createThemeSlice(DEFAULT_THEME).actions;

/** 根节点上的主题属性与变量；prefersDark 用于“跟随系统” */
export function themeRootProps(theme: ThemeState | undefined, prefersDark: boolean) {
  if (!theme) return {};
  const dark = theme.scheme === 'dark' || (theme.scheme === 'system' && prefersDark);
  const style: JSX.CSSProperties = {};
  if (theme.accent) style['--kb-accent'] = theme.accent;
  if (theme.fontSize !== DEFAULT_THEME.fontSize) {
    style['--kb-font-size'] = `${theme.fontSize}px`;
    style['--kb-font-size-sm'] = `${theme.fontSize - 1}px`;
  }
  return {
    'data-scheme': dark ? 'dark' : undefined,
    'data-accent': theme.accent ? '' : undefined,
    'data-density': theme.density === 'standard' ? undefined : theme.density,
    style,
  };
}

const STORAGE_KEY = 'state.v1';

/** 主题：配色方案、主题色、界面密度与字号，运行期切换 `--kb-*` 变量并持久化 */
export const themePlugin = (options: ThemeOptions = {}) =>
  definePlugin({
    name: 'kabel:theme',
    title: '主题',
    builtin: true,
    setup(ctx) {
      const initial = sanitizeTheme(DEFAULT_THEME, { ...DEFAULT_THEME, ...options.defaults });
      const slice = createThemeSlice(initial);
      const persist = options.persist !== false;
      const saved = persist ? ctx.storage.get<Partial<ThemeState> | null>(STORAGE_KEY, null) : null;
      ctx.registerSlice(slice, sanitizeTheme(initial, saved));
      ctx.provide(THEME_ACCENTS, options.accents ?? DEFAULT_ACCENTS);
      if (persist) ctx.watch((s) => s.theme, (theme) => ctx.storage.set(STORAGE_KEY, theme));

      ctx.registerCommand({
        id: 'theme.set',
        hidden: true,
        title: '设置主题',
        run: (k, patch: Partial<ThemeState>) => k.dispatch(slice.actions.set(patch)),
      });
      ctx.registerCommand({
        id: 'theme.reset',
        title: '恢复默认主题',
        run: (k) => k.dispatch(slice.actions.reset()),
      });
      ctx.contribute(ExtensionPoints.settings, { id: 'theme', title: '主题', icon: 'palette', order: 20, view: ThemePage });
    },
  });
