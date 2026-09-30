import { DEFAULT_ICON_PREFIX } from './config';

/**
 * 内置图标集（iconfont Symbol 格式）。24×24 线性图标，统一 1.6 线宽，风格克制。
 * 结构与 iconfont.cn 导出的 symbol 脚本一致，可被宿主 iconfont 项目整体替换。
 */
const ICONS: Record<string, string> = {
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  validate: 'M4 4h16v16H4z M8 12l3 3 5-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'fold-left': 'M11 7l-5 5 5 5 M18 7l-5 5 5 5',
  'fold-right': 'M13 7l5 5-5 5 M6 7l5 5-5 5',
  'panel-left': 'M4 5h16v14H4z M9.5 5v14',
  'panel-right': 'M4 5h16v14H4z M14.5 5v14',
  maximize: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  restore: 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
  close: 'M6 6l12 12 M18 6 6 18',
  'zoom-in': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6 M11 8v6',
  'zoom-out': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6',
  fit: 'M4 8V4h4 M20 8V4h-4 M4 16v4h4 M20 16v4h-4 M9 9h6v6H9z',
  'actual-size': 'M4 5h16v14H4z M8 9.5 9.5 9v6 M15 9.5 16.5 9v6 M12.25 10.5v.01 M12.25 13.5v.01',
  'rotate-left': 'M4 12a8 8 0 1 0 2.4-5.7L4 8.5 M4 4v4.5h4.5',
  'rotate-right': 'M20 12a8 8 0 1 1-2.4-5.7L20 8.5 M20 4v4.5h-4.5',
  image: 'M4 5h16v14H4z M9 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M20 15l-5-5L5 19',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  history: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  warning: 'M12 3.5 21 19.5H3z M12 10v4 M12 17v.01',
  error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9 9l6 6 M15 9l-6 6',
  success: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12l3 3 5-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8v.01',
  reset: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  unfold: 'M7 9l5-5 5 5 M7 15l5 5 5-5',
  fold: 'M7 4l5 5 5-5 M7 20l5-5 5 5',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  submit: 'M4 12 20 4l-6 16-3-7z M11 13l9-9',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
  folder: 'M3 6h6l2 2h10v11H3z',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 8h.01',
  hash: 'M9.5 4 7.5 20 M16.5 4l-2 16 M4.5 9h16 M3.5 15h16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  layout: 'M4 5h16v14H4z M4 9.5h16 M10 9.5V19',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M19 10h.01 M7 14h10',
  command: 'M5 8l4 4-4 4 M12 16h7',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.5 7.5 0 0 1-2.1 1.2L14.7 21h-4l-.3-2.1a7.5 7.5 0 0 1-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-2.9L4.4 9.6l2-3.4 1.9.7a7.5 7.5 0 0 1 2.1-1.2L10.7 3.6h4l.3 2.1a7.5 7.5 0 0 1 2.1 1.2l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 2.9z',
  plugin: 'M9 3v4 M15 3v4 M6 7h12v4a6 6 0 0 1-12 0z M12 17v4',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.4 3.4A1.3 1.3 0 0 1 12 21z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01 M17 11h.01',
  box: 'M4 4h3 M10 4h4 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4 M4 7V4',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12 M11 11V5a1.5 1.5 0 0 1 3 0v6 M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L4 15.5a1.6 1.6 0 0 1 2.4-2.1L8 15',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5',
  sparkles: 'M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z M17 3v3 M15.5 4.5h3',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 5v4 M9 15v4',
};

export const builtinIconNames = Object.keys(ICONS);

const SPRITE_ID = 'kabel-iconfont-sprite';

function buildSprite(prefix: string): string {
  const symbols = Object.entries(ICONS)
    .map(
      ([name, d]) =>
        `<symbol id="${prefix}${name}" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${SPRITE_ID}" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
}

/** 向 document 注入内置 symbol 雪碧图（仅一次）。只追加一个隐藏的 svg 节点，不影响宿主样式。 */
export function ensureBuiltinSprite(doc: Document | undefined = globalThis.document): void {
  if (!doc?.body || doc.getElementById(SPRITE_ID)) return;
  const holder = doc.createElement('div');
  holder.innerHTML = buildSprite(DEFAULT_ICON_PREFIX);
  const svg = holder.firstElementChild;
  if (svg) doc.body.insertBefore(svg, doc.body.firstChild);
}

const loadedScripts = new Set<string>();

/** 加载宿主 iconfont 项目的 symbol 脚本 */
export function loadIconfontScript(url: string, doc: Document | undefined = globalThis.document): void {
  if (!doc || loadedScripts.has(url)) return;
  loadedScripts.add(url);
  const script = doc.createElement('script');
  script.src = url;
  script.async = true;
  doc.head.appendChild(script);
}
