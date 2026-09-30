import { eventToKeybinding, formatKeybinding, sameKeybinding, type CommandDefinition, type SettingsPageProps } from '@kabel/core';
import { useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { Input } from '../components/form';
import { useCommandsVersion, useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';
import { commandBindings, findConflicts, listedCommands, type KeyConflict } from './bindings';
import { keymapActions } from './keymap-plugin';

interface PendingAssign {
  id: string;
  binding: string;
  conflicts: KeyConflict[];
}

/** 设置 › 快捷键：查看、改绑、清除、恢复默认；重复占用同一快捷键时给出提示，可选择覆盖 */
export function ShortcutsPage({ kernel }: SettingsPageProps) {
  useCommandsVersion();
  const overrides = useSelector((s) => s.keymap?.overrides ?? {});
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAssign | null>(null);
  const state = kernel.getState();

  const all = listedCommands(kernel);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = all.filter((c) => words.every((w) => `${c.title} ${c.id}`.toLowerCase().includes(w)));

  // 同一快捷键被多个命令占用
  const used = new Map<string, string[]>();
  for (const c of kernel.commands.list()) {
    for (const b of commandBindings(c, state)) {
      const key = formatKeybinding(b, false);
      used.set(key, [...(used.get(key) ?? []), c.id]);
    }
  }
  const duplicated = (binding: string) => (used.get(formatKeybinding(binding, false))?.length ?? 0) > 1;

  const assign = (id: string, binding: string) => {
    kernel.dispatch(keymapActions.set({ id, bindings: [binding] }));
    setPending(null);
    setRecording(null);
  };

  const onRecord = (command: CommandDefinition, event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return setRecording(null);
    const binding = eventToKeybinding(event);
    if (!binding) return;
    const conflicts = findConflicts(kernel, binding, command.id);
    if (conflicts.length) {
      setRecording(null);
      setPending({ id: command.id, binding, conflicts });
    } else assign(command.id, binding);
  };

  const override = () => {
    if (!pending) return;
    // 从占用者身上摘掉该快捷键，再分配给当前命令
    for (const { command, binding } of pending.conflicts) {
      const rest = commandBindings(command, kernel.getState()).filter((b) => !sameKeybinding(b, binding));
      kernel.dispatch(keymapActions.set({ id: command.id, bindings: rest }));
    }
    assign(pending.id, pending.binding);
  };

  const titleOf = (c: CommandDefinition) => c.title ?? c.id;

  return (
    <div class="kb-shortcuts">
      <div class="kb-shortcuts__bar">
        <Input value={query} onChange={setQuery} placeholder="搜索命令" />
        <Button disabled={!Object.keys(overrides).length} onClick={() => kernel.dispatch(keymapActions.resetAll())}>
          全部恢复默认
        </Button>
      </div>
      {!rows.length ? (
        <Empty icon="keyboard" text="没有匹配的命令" />
      ) : (
        <table class="kb-table kb-shortcuts__table">
          <thead>
            <tr>
              <th>命令</th>
              <th>快捷键</th>
              <th class="kb-table__action">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((command) => {
              const bindings = commandBindings(command, state);
              const changed = command.id in overrides;
              const isRecording = recording === command.id;
              const conflict = pending?.id === command.id ? pending : null;
              return (
                <>
                  <tr key={command.id}>
                    <td>
                      <div>{titleOf(command)}</div>
                      <div class="kb-table__code">{command.id}</div>
                    </td>
                    <td>
                      {isRecording ? (
                        <button
                          type="button"
                          class="kb-keycap kb-keycap--recording"
                          autoFocus
                          ref={(el) => el?.focus()}
                          onKeyDown={(e) => onRecord(command, e)}
                          onBlur={() => setRecording((r) => (r === command.id ? null : r))}
                        >
                          按下新的快捷键（Esc 取消）
                        </button>
                      ) : bindings.length ? (
                        bindings.map((b) => (
                          <kbd key={b} class={cx('kb-keycap', duplicated(b) && 'is-conflict')} title={duplicated(b) ? '与其他命令的快捷键冲突' : undefined}>
                            {duplicated(b) && <Icon name="warning" />}
                            {formatKeybinding(b)}
                          </kbd>
                        ))
                      ) : (
                        <span class="kb-shortcuts__none">未设置</span>
                      )}
                    </td>
                    <td class="kb-table__action kb-shortcuts__actions">
                      <Button size="sm" onClick={() => (setPending(null), setRecording(command.id))}>
                        修改
                      </Button>
                      <Button size="sm" disabled={!bindings.length} onClick={() => kernel.dispatch(keymapActions.set({ id: command.id, bindings: [] }))}>
                        清除
                      </Button>
                      <Button size="sm" disabled={!changed} onClick={() => kernel.dispatch(keymapActions.reset(command.id))}>
                        恢复默认
                      </Button>
                    </td>
                  </tr>
                  {conflict && (
                    <tr key={`${command.id}:conflict`} class="kb-shortcuts__conflict">
                      <td colSpan={3}>
                        <Icon name="warning" />
                        <span>
                          {formatKeybinding(conflict.binding)} 已被「{conflict.conflicts.map((c) => titleOf(c.command)).join('」「')}」使用。
                        </span>
                        <Button size="sm" variant="primary" onClick={override}>
                          覆盖
                        </Button>
                        <Button size="sm" onClick={() => setPending(null)}>
                          取消
                        </Button>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
