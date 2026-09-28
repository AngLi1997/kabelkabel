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
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
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
