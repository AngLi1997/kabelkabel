import { formatKeybinding } from '@kabel/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useCommandsVersion, useKernel, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { commandBindings, listedCommands } from '../keymap/bindings';
import { cx } from '../utils';
import { paletteActions } from './palette-plugin';

/** 命令面板：输入关键字过滤当前可执行的命令，↑↓ 选择，Enter 执行，Esc 关闭 */
export function CommandPalette() {
  const open = useSelector((s) => !!s.palette?.open);
  return open ? <Palette /> : null;
}

function Palette() {
  const kernel = useKernel();
  useCommandsVersion();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const state = kernel.getState();

  const items = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return listedCommands(kernel)
      .filter((c) => c.id !== 'palette.open' && kernel.commands.isEnabled(c.id))
      .filter((c) => words.every((w) => `${c.title} ${c.id}`.toLowerCase().includes(w)));
  }, [kernel, query]);

  const close = () => kernel.dispatch(paletteActions.close());
  const run = (id: string) => {
    close();
    kernel.execute(id).catch((error) => kernel.bus.emit('error', { error, source: id }));
  };

  // 打开时聚焦输入框，关闭后焦点回到原处
  useEffect(() => {
    const previous = input.current?.ownerDocument.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[active];
      if (item) run(item.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div class="kb-modal kb-modal--top" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="kb-palette" role="dialog" aria-modal="true" aria-label="命令面板" onKeyDown={onKeyDown}>
        <div class="kb-palette__search">
          <Icon name="command" />
          <input
            ref={input}
            class="kb-palette__input"
            value={query}
            placeholder="输入命令名称"
            role="combobox"
            aria-expanded="true"
            aria-controls="kb-palette-list"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <div id="kb-palette-list" ref={list} class="kb-palette__list kb-scroll" role="listbox">
          {items.length === 0 && <div class="kb-palette__empty">没有匹配的命令</div>}
          {items.map((command, i) => {
            const binding = commandBindings(command, state)[0];
            return (
              <div
                key={command.id}
                role="option"
                aria-selected={i === active}
                class={cx('kb-palette__item', i === active && 'is-active')}
                onPointerMove={() => setActive(i)}
                onClick={() => run(command.id)}
              >
                {command.icon ? <Icon name={command.icon} /> : <span class="kb-palette__icon" />}
                <span class="kb-palette__title">{command.title}</span>
                {binding && <kbd class="kb-keycap">{formatKeybinding(binding)}</kbd>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
