import { ExtensionPoints, formatKeybinding, type ToolbarItem } from '@kabel/core';
import { Button } from '../components/Button';
import { ViewHost } from '../components/ViewHost';
import { useCommandsVersion, useContributions, useKernel, useStoreState, type Breakpoint } from '../hooks';
import { runAction } from './run';

/** 去掉首尾及连续的分隔符 */
function tidy(items: ToolbarItem[]): ToolbarItem[] {
  const out: ToolbarItem[] = [];
  for (const item of items) {
    if (item.type === 'separator' && (!out.length || out[out.length - 1]!.type === 'separator')) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1]!.type === 'separator') out.pop();
  return out;
}

/** 宽屏显示图标 + 文字；中等宽度仅主按钮显示文字；窄屏仅图标 */
export function Toolbar({ breakpoint = 'lg' }: { breakpoint?: Breakpoint }) {
  const kernel = useKernel();
  const state = useStoreState();
  const items = useContributions(ExtensionPoints.toolbar);
  useCommandsVersion();
  const visible = items.filter((item) => !item.when || item.when(state, kernel));
  const start = tidy(visible.filter((i) => (i.group ?? 'start') === 'start'));
  const end = tidy(visible.filter((i) => i.group === 'end'));
  const render = (item: ToolbarItem) => <ToolbarEntry key={item.id} item={item} breakpoint={breakpoint} />;
  return (
    <div class="kb-toolbar" role="toolbar">
      <div class="kb-toolbar__group">{start.map(render)}</div>
      <div class="kb-toolbar__group">{end.map(render)}</div>
    </div>
  );
}

function ToolbarEntry({ item, breakpoint }: { item: ToolbarItem; breakpoint: Breakpoint }) {
  const kernel = useKernel();
  if (item.type === 'separator') return <span class="kb-toolbar__sep" role="separator" />;
  if (item.type === 'view' && item.view) return <ViewHost view={item.view} props={{ kernel }} />;
  const command = item.command ? kernel.commands.get(item.command) : undefined;
  const enabled = item.command ? kernel.commands.isEnabled(item.command) : true;
  const checked = command?.checked ? kernel.commands.isChecked(item.command!) : undefined;
  const keys = command?.keybinding ? [command.keybinding].flat()[0] : undefined;
  const label = item.label ?? command?.title;
  const tooltip = [item.tooltip ?? label, keys && `(${formatKeybinding(keys)})`].filter(Boolean).join(' ');
  const wanted = item.showLabel ?? !!item.label;
  const icon = item.icon ?? command?.icon;
  // 没有图标的按钮始终显示文字，避免出现空按钮
  const showLabel = !!label && (!icon || (wanted && (breakpoint === 'lg' || (breakpoint === 'md' && !!item.primary))));
  return (
    <Button
      icon={icon}
      variant={item.primary ? 'primary' : 'text'}
      disabled={!enabled}
      active={checked}
      title={tooltip}
      onClick={() => runAction(kernel, item)}
    >
      {showLabel ? label : undefined}
    </Button>
  );
}
