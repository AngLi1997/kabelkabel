import type { PanelAction } from '@kabel/core';
import { IconButton } from '../components/Button';
import { useKernel, useStoreState } from '../hooks';
import { runAction } from './run';

export function PanelActions({ actions }: { actions?: readonly PanelAction[] }) {
  if (!actions?.length) return null;
  return <PanelActionList actions={actions} />;
}

function PanelActionList({ actions }: { actions: readonly PanelAction[] }) {
  const kernel = useKernel();
  const state = useStoreState();
  return (
    <div class="kb-panel-actions">
      {actions.map((action) => (
        <IconButton
          key={action.id}
          icon={action.icon}
          title={action.tooltip ?? ''}
          active={action.active?.(state, kernel)}
          disabled={action.command ? !kernel.commands.isEnabled(action.command) : false}
          onClick={() => runAction(kernel, action)}
        />
      ))}
    </div>
  );
}
