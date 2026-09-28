import type { KabelPlugin, SettingsPageProps } from '@kabel/core';
import { useReducer, useRef } from 'preact/hooks';
import { Empty } from '../components/Empty';
import { Switch } from '../components/form';
import { useEvent } from '../hooks';

const forceReducer = (n: number) => n + 1;

export interface PluginRow {
  plugin: KabelPlugin;
  /** 树形层级：0 为顶层，依赖其他插件的插件列在被依赖者之下 */
  depth: number;
}

/** 按依赖关系排成树：依赖其他（可管理）插件的插件缩进列在其下；内置插件（builtin）不显示 */
export function pluginTree(plugins: readonly KabelPlugin[]): PluginRow[] {
  const visible = plugins.filter((p) => !p.builtin);
  const names = new Set(visible.map((p) => p.name));
  const parentOf = (p: KabelPlugin) => p.dependencies?.find((d) => names.has(d));
  const children = new Map<string, KabelPlugin[]>();
  for (const p of visible) {
    const parent = parentOf(p);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const rows: PluginRow[] = [];
  const walk = (p: KabelPlugin, depth: number) => {
    rows.push({ plugin: p, depth });
    for (const child of children.get(p.name) ?? []) walk(child, depth + 1);
  };
  for (const root of visible.filter((p) => !parentOf(p))) walk(root, 0);
  return rows;
}

/** 插件管理：以树形列表列出可管理的插件，运行期启停（依赖方随之停用，依赖随之启用） */
export function PluginsPage({ kernel }: SettingsPageProps) {
  const [, force] = useReducer(forceReducer, 0);
  useEvent('plugin:registered', () => force(0));
  useEvent('plugin:unregistered', () => force(0));

  const manager = kernel.plugins;
  const all = [...manager.list(), ...manager.listDisabled()];
  // 按首次出现的顺序排列，启停时行位置保持不变
  const order = useRef<string[]>([]);
  for (const plugin of all) if (!order.current.includes(plugin.name)) order.current.push(plugin.name);
  const byName = new Map(all.map((p) => [p.name, p]));
  const plugins = order.current.map((name) => byName.get(name)).filter((p): p is KabelPlugin => !!p);
  const rows = pluginTree(plugins);
  const titleOf = (name: string) => byName.get(name)?.title ?? name;

  const toggle = (plugin: KabelPlugin, enabled: boolean) => {
    if (!enabled) manager.disable(plugin.name);
    else manager.enable(plugin.name).catch((error) => kernel.bus.emit('error', { error, source: `plugin:${plugin.name}` }));
  };

  if (!rows.length) return <Empty icon="plugin" text="暂无可管理的插件" />;

  return (
    <table class="kb-table kb-plugins">
      <thead>
        <tr>
          <th>插件</th>
          <th>标识</th>
          <th>版本</th>
          <th>依赖</th>
          <th class="kb-table__action">启用</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ plugin, depth }) => {
          const enabled = manager.has(plugin.name);
          return (
            <tr key={plugin.name} class={enabled ? undefined : 'is-disabled'}>
              <td>
                <span class="kb-plugins__name" style={{ '--kb-depth': depth }}>
                  {depth > 0 && <span class="kb-plugins__branch" aria-hidden="true" />}
                  {plugin.title ?? plugin.name}
                </span>
              </td>
              <td class="kb-table__code">{plugin.name}</td>
              <td>{plugin.version ?? '—'}</td>
              <td>{plugin.dependencies?.length ? plugin.dependencies.map(titleOf).join('、') : '—'}</td>
              <td class="kb-table__action">
                <Switch checked={enabled} label={`启用${plugin.title ?? plugin.name}`} onChange={(next) => toggle(plugin, next)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
