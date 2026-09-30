import { ExtensionPoints, formatKeybinding, type ContextMenuContext, type ContextMenuItem, type Kernel, type KabelState } from '@kabel/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useContributions, useKernel, useSelector, useStoreState } from '../hooks';
import { Icon } from '../icons/Icon';
import { commandBindings } from '../keymap/bindings';
import { runAction } from '../shell/run';
import { cx } from '../utils';
import { contextMenuActions } from './contextmenu-plugin';

const matches = (item: ContextMenuItem, target: string) => {
  const targets = item.target === undefined ? ['*'] : [item.target].flat();
  return targets.includes('*') || targets.includes(target);
};

/** 当前区域下可见的菜单项（按 order 排序，`when` 为假的隐藏） */
export function menuItemsFor(items: readonly ContextMenuItem[], state: KabelState, kernel: Kernel, context: ContextMenuContext) {
  return items.filter((i) => matches(i, context.target) && (!i.when || i.when(state, kernel, context)));
}

export function ContextMenu() {
  const open = useSelector((s) => !!s.contextmenu?.open);
  return open ? <Menu /> : null;
}

function Menu() {
  const kernel = useKernel();
  const state = useStoreState();
  const { x, y, target, data } = state.contextmenu;
  const context: ContextMenuContext = { target, data };
  const all = useContributions(ExtensionPoints.contextMenu);
  const items = menuItemsFor(all, state, kernel, context);
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const close = () => kernel.dispatch(contextMenuActions.hide());

  // 不超出工作台边界
  useLayoutEffect(() => {
    const menu = el.current;
    const root = menu?.closest('.kb-root');
    if (!menu || !root) return;
    const box = root.getBoundingClientRect();
    setPos({ x: Math.max(0, Math.min(x, box.width - menu.offsetWidth - 4)), y: Math.max(0, Math.min(y, box.height - menu.offsetHeight - 4)) });
  }, [x, y, items.length]);

  useEffect(() => {
    const doc = el.current?.ownerDocument;
    if (!doc) return;
    const away = (event: Event) => {
      if (!el.current?.contains(event.target as Node)) close();
    };
    doc.addEventListener('pointerdown', away, true);
    doc.addEventListener('scroll', close, true);
    el.current?.focus();
    return () => {
      doc.removeEventListener('pointerdown', away, true);
      doc.removeEventListener('scroll', close, true);
    };
  }, []);

  const enabled = (item: ContextMenuItem) => !item.command || kernel.commands.isEnabled(item.command);
  const run = (item: ContextMenuItem) => {
    if (!enabled(item)) return;
    close();
    runAction(kernel, { command: item.command, args: item.args, onClick: item.onClick ? (k) => item.onClick!(k, context) : undefined });
  };
  const step = (dir: 1 | -1) => {
    const usable = items.map((it, i) => (enabled(it) ? i : -1)).filter((i) => i >= 0);
    if (!usable.length) return;
    const at = usable.indexOf(active);
    setActive(usable[(at + dir + usable.length) % usable.length]!);
  };

  if (!items.length) return null;
  return (
    <div
      ref={el}
      class="kb-contextmenu"
      role="menu"
      tabIndex={-1}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          step(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter' && items[active]) {
          e.preventDefault();
          run(items[active]!);
        }
      }}
    >
      {items.map((item, i) => {
        const command = item.command ? kernel.commands.get(item.command) : undefined;
        const binding = command ? commandBindings(command, state)[0] : undefined;
        const newGroup = i > 0 && (items[i - 1]!.group ?? '') !== (item.group ?? '');
        return (
          <>
            {newGroup && <div key={`${item.id}:sep`} class="kb-contextmenu__sep" role="separator" />}
            <button
              key={item.id}
              type="button"
              role="menuitem"
              class={cx('kb-contextmenu__item', i === active && 'is-active')}
              disabled={!enabled(item)}
              onPointerMove={() => setActive(i)}
              onClick={() => run(item)}
            >
              {item.icon ? <Icon name={item.icon} /> : <span class="kb-contextmenu__icon" />}
              <span class="kb-contextmenu__label">{item.label}</span>
              {binding && <span class="kb-contextmenu__key">{formatKeybinding(binding)}</span>}
            </button>
          </>
        );
      })}
    </div>
  );
}
