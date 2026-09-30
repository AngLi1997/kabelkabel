export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ParsedKeybinding {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** 解析 `Mod+Shift+Z` 形式的快捷键；`Mod` 在 macOS 上为 ⌘，其他平台为 Ctrl */
export function parseKeybinding(binding: string, mac = isMacPlatform()): ParsedKeybinding {
  const parts = binding.split('+').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const result: ParsedKeybinding = { key: '', ctrl: false, meta: false, shift: false, alt: false };
  for (const part of parts) {
    if (part === 'mod') {
      if (mac) result.meta = true;
      else result.ctrl = true;
    } else if (part === 'ctrl' || part === 'control') result.ctrl = true;
    else if (part === 'cmd' || part === 'meta') result.meta = true;
    else if (part === 'shift') result.shift = true;
    else if (part === 'alt' || part === 'option') result.alt = true;
    else result.key = part === 'esc' ? 'escape' : part === 'space' ? ' ' : part;
  }
  return result;
}

const keyOf = (key: string) => key.toLowerCase();

export function matchKeybinding(event: KeyLike, binding: string, mac = isMacPlatform()): boolean {
  const parsed = parseKeybinding(binding, mac);
  return (
    keyOf(event.key) === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

export function formatKeybinding(binding: string, mac = isMacPlatform()): string {
  const p = parseKeybinding(binding, mac);
  const key = p.key === ' ' ? 'Space' : p.key.length === 1 ? p.key.toUpperCase() : p.key[0]!.toUpperCase() + p.key.slice(1);
  if (mac) return `${p.ctrl ? '⌃' : ''}${p.alt ? '⌥' : ''}${p.shift ? '⇧' : ''}${p.meta ? '⌘' : ''}${key}`;
  return [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', p.meta && 'Win', key].filter(Boolean).join('+');
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'os', 'altgraph', 'capslock']);

/**
 * 把键盘事件转成 `Mod+Shift+K` 形式的快捷键；只按下修饰键时返回 null。
 * macOS 上 ⌘ 记为 `Mod`、⌃ 记为 `Ctrl`；其他平台 Ctrl 记为 `Mod`、Win 键记为 `Meta`。
 */
export function eventToKeybinding(event: KeyLike, mac = isMacPlatform()): string | null {
  const key = keyOf(event.key);
  if (!key || MODIFIER_KEYS.has(key)) return null;
  const parts: string[] = [];
  if (mac) {
    if (event.metaKey) parts.push('Mod');
    if (event.ctrlKey) parts.push('Ctrl');
  } else {
    if (event.ctrlKey) parts.push('Mod');
    if (event.metaKey) parts.push('Meta');
  }
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1));
  return parts.join('+');
}

/** 两个快捷键写法是否等价（忽略大小写与修饰键顺序） */
export function sameKeybinding(a: string, b: string, mac = isMacPlatform()): boolean {
  const x = parseKeybinding(a, mac);
  const y = parseKeybinding(b, mac);
  return x.key === y.key && x.ctrl === y.ctrl && x.meta === y.meta && x.shift === y.shift && x.alt === y.alt;
}
