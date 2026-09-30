import { sameKeybinding, type CommandDefinition, type Kernel, type KabelState } from '@kabel/core';

/** 命令当前生效的快捷键：用户改绑优先（空数组表示已清除），否则为命令声明的默认值 */
export function commandBindings(command: CommandDefinition, state: KabelState): string[] {
  const override = state.keymap?.overrides[command.id];
  if (override) return override;
  return command.keybinding ? [command.keybinding].flat() : [];
}

/** 出现在命令面板与快捷键设置中的命令 */
export const listedCommands = (kernel: Kernel): CommandDefinition[] =>
  kernel.commands.list().filter((c) => c.title && !c.hidden);

export interface KeyConflict {
  command: CommandDefinition;
  binding: string;
}

/** 找出已占用某个快捷键的其他命令 */
export function findConflicts(kernel: Kernel, binding: string, exceptId?: string): KeyConflict[] {
  const state = kernel.getState();
  const found: KeyConflict[] = [];
  for (const command of kernel.commands.list()) {
    if (command.id === exceptId) continue;
    const hit = commandBindings(command, state).find((b) => sameKeybinding(b, binding));
    if (hit) found.push({ command, binding: hit });
  }
  return found;
}
