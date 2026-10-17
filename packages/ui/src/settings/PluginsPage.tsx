import { NOTIFY_SERVICE, type KabelPlugin, type Kernel, type SettingsPageProps } from '@kabel/core';
import { useReducer, useRef, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { Switch } from '../components/form';
import { SchemaForm } from '../components/SchemaForm';
import { useEvent } from '../hooks';
import { cx } from '../utils';

const forceReducer = (n: number) => n + 1;

export interface PluginRow {
  plugin: KabelPlugin;
  /** 树形层级：0 为顶层，依赖其他插件或由其他插件注册（子插件）的插件列在其下 */
  depth: number;
}

/**
 * 按依赖关系排成树：子插件（`ctx.plugin` 注册）列在父插件下，
 * 依赖其他（可管理）插件的插件列在被依赖者下；内置插件（builtin）不显示。
 */
export function pluginTree(plugins: readonly KabelPlugin[], parentOf?: (name: string) => string | undefined): PluginRow[] {
  const visible = plugins.filter((p) => !p.builtin);
  const names = new Set(visible.map((p) => p.name));
  const parentFor = (p: KabelPlugin) => {
    const owner = parentOf?.(p.name);
    if (owner && names.has(owner)) return owner;
    return p.dependencies?.find((d) => names.has(d));
  };
  const children = new Map<string, KabelPlugin[]>();
  for (const p of visible) {
    const parent = parentFor(p);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const rows: PluginRow[] = [];
  const walk = (p: KabelPlugin, depth: number) => {
    rows.push({ plugin: p, depth });
    for (const child of children.get(p.name) ?? []) walk(child, depth + 1);
  };
  for (const root of visible.filter((p) => !parentFor(p))) walk(root, 0);
  return rows;
}

/** 插件管理：树形列出可管理的插件，显示状态，运行期启停；声明了 `Config` 的插件可编辑配置 */
export function PluginsPage({ kernel }: SettingsPageProps) {
  const [, force] = useReducer(forceReducer, 0);
  const [editing, setEditing] = useState<string | null>(null);
  useEvent('plugin:registered', () => force(0));
  useEvent('plugin:unregistered', () => force(0));
  useEvent('plugin:status', () => force(0));

  const manager = kernel.plugins;
  const all = [...manager.list(), ...manager.listDisabled()];
  // 按首次出现的顺序排列，启停时行位置保持不变
  const order = useRef<string[]>([]);
  for (const plugin of all) if (!order.current.includes(plugin.name)) order.current.push(plugin.name);
  const byName = new Map(all.map((p) => [p.name, p]));
  const plugins = order.current.map((name) => byName.get(name)).filter((p): p is KabelPlugin => !!p);
  const rows = pluginTree(plugins, (name) => manager.parentOf(name));
  const titleOf = (name: string) => byName.get(name)?.title ?? name;

  const editingPlugin = editing ? byName.get(editing) : undefined;
  if (editingPlugin?.Config) return <PluginConfig kernel={kernel} plugin={editingPlugin} onBack={() => setEditing(null)} />;

  const toggle = (plugin: KabelPlugin, enabled: boolean) => {
    if (!enabled) manager.disable(plugin.name);
    else manager.enable(plugin.name).catch((error) => kernel.bus.emit('error', { error, source: `plugin:${plugin.name}` }));
  };

  if (!rows.length) return <Empty icon="plugin" text="暂无可管理的插件" />;

  return (
    <table class="kb-table kb-plugins">
      <colgroup>
        <col class="kb-plugins__col-name" />
        <col class="kb-plugins__col-id" />
        <col class="kb-plugins__col-status" />
        <col class="kb-plugins__col-deps" />
        <col class="kb-plugins__col-config" />
        <col class="kb-plugins__col-switch" />
      </colgroup>
      <thead>
        <tr>
          <th>插件</th>
          <th class="kb-plugins__id">标识</th>
          <th>状态</th>
          <th class="kb-plugins__deps">依赖</th>
          <th class="kb-table__action">配置</th>
          <th class="kb-table__action">启用</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ plugin, depth }) => {
          const status = manager.status(plugin.name);
          const enabled = status === 'active' || status === 'pending';
          const blockers = status === 'pending' ? manager.blockers(plugin.name) : [];
          const requires = [...(plugin.dependencies ?? []).map(titleOf), ...injectNames(plugin)];
          return (
            <tr key={plugin.name} class={enabled ? undefined : 'is-disabled'}>
              <td class="kb-plugins__name-cell">
                <span class="kb-plugins__name" style={{ '--kb-depth': depth }} title={`${plugin.title ?? plugin.name}（${plugin.name}）`}>
                  {depth > 0 && <span class="kb-plugins__branch" aria-hidden="true" />}
                  <span class="kb-plugins__label">{plugin.title ?? plugin.name}</span>
                </span>
              </td>
              <td class="kb-table__code kb-plugins__id" title={plugin.name}>
                {plugin.name}
              </td>
              <td>
                <span
                  class={cx('kb-plugins__status', `is-${status ?? 'disabled'}`)}
                  title={blockers.length ? `等待：${blockers.join('、')}` : undefined}
                >
                  {status === 'active' ? '运行中' : status === 'pending' ? '等待服务' : '已停用'}
                </span>
              </td>
              <td class="kb-plugins__deps" title={requires.join('、') || undefined}>
                {requires.length ? requires.join('、') : '—'}
              </td>
              <td class="kb-table__action">
                {plugin.Config ? (
                  <Button size="sm" variant="text" icon="sliders" onClick={() => setEditing(plugin.name)}>
                    配置
                  </Button>
                ) : (
                  '—'
                )}
              </td>
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

const injectNames = (plugin: KabelPlugin): string[] => {
  const inject = plugin.inject;
  if (!inject) return [];
  if (Array.isArray(inject)) return inject.map((t) => t.id);
  const { required = [], optional = [] } = inject as { required?: { id: string }[]; optional?: { id: string }[] };
  return [...required.map((t) => t.id), ...optional.map((t) => `${t.id}（可选）`)];
};

interface PluginConfigProps {
  kernel: Kernel;
  plugin: KabelPlugin;
  onBack: () => void;
}

/** 插件配置：由 `Config` 生成表单，保存时校验并持久化，插件随之重载 */
function PluginConfig({ kernel, plugin, onBack }: PluginConfigProps) {
  const manager = kernel.plugins;
  const [draft, setDraft] = useState<unknown>(() => clone(manager.getConfig(plugin.name) ?? plugin.Config!(undefined as never)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = (task: () => Promise<void>, message: string) => {
    setSaving(true);
    setError(null);
    task()
      .then(() => {
        setDraft(clone(manager.getConfig(plugin.name)));
        kernel.services.tryGet(NOTIFY_SERVICE)?.notify(message, { type: 'success', duration: 2000 });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  };

  return (
    <div class="kb-plugin-config">
      <div class="kb-plugin-config__header">
        <Button size="sm" variant="text" icon="chevron-left" onClick={onBack}>
          返回
        </Button>
        <span class="kb-plugin-config__title">{plugin.title ?? plugin.name}</span>
        <span class="kb-table__code">{plugin.name}</span>
      </div>
      <SchemaForm schema={plugin.Config!} value={draft} onChange={setDraft} disabled={saving} />
      {error && <div class="kb-plugin-config__error">{error}</div>}
      <div class="kb-plugin-config__footer">
        <Button disabled={saving || !manager.hasStoredConfig(plugin.name)} onClick={() => run(() => manager.resetConfig(plugin.name), '已恢复默认配置')}>
          恢复默认
        </Button>
        <Button variant="primary" icon="save" disabled={saving} onClick={() => run(() => manager.updateConfig(plugin.name, draft), '配置已保存，插件已重新加载')}>
          保存
        </Button>
      </div>
    </div>
  );
}

const clone = <T,>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
