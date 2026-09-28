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
    else result.key = part === 'esc' ? 'escape' : part;
  }
  return result;
}

export function matchKeybinding(event: KeyLike, binding: string, mac = isMacPlatform()): boolean {
  const parsed = parseKeybinding(binding, mac);
  return (
    event.key.toLowerCase() === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

export function formatKeybinding(binding: string, mac = isMacPlatform()): string {
  const p = parseKeybinding(binding, mac);
  const key = p.key.length === 1 ? p.key.toUpperCase() : p.key[0]!.toUpperCase() + p.key.slice(1);
  if (mac) return `${p.ctrl ? '⌃' : ''}${p.alt ? '⌥' : ''}${p.shift ? '⇧' : ''}${p.meta ? '⌘' : ''}${key}`;
  return [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', p.meta && 'Win', key].filter(Boolean).join('+');
}
