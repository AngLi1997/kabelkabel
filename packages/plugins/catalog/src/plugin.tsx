import { definePlugin, ExtensionPoints, Schema, type RegionId } from '@kabel/core';
import { FIELDS_SERVICE } from '@kabel/plugin-fields';
import { CatalogPanel } from './CatalogPanel';
import { catalogActions, catalogSlice } from './slice';

export interface CatalogConfig {
  title: string;
  region: RegionId;
  columns: number;
  order: number;
}

export const CatalogConfigSchema: Schema<Partial<CatalogConfig>, CatalogConfig> = Schema.object({
  title: Schema.string().default('档案详情数据').description('面板标题'),
  region: Schema.union([
    Schema.const('left').description('左侧'),
    Schema.const('main').description('中间'),
    Schema.const('right').description('右侧'),
  ])
    .default('right')
    .description('面板位置'),
  columns: Schema.union([Schema.const(1).description('单列'), Schema.const(2).description('两列')])
    .default(2)
    .description('字段列数'),
  order: Schema.number().default(10).description('排序'),
}) as never;

export const CATALOG_PLUGIN = 'kabel:catalog';

/**
 * 著录面板（业务插件）：注入字段模型服务，按分组渲染“档案详情数据”。
 * 只是字段模型的一个视图——识别、智能提取写入的值在这里显示为“识别填入 / AI 已填入 · 待复核”。
 */
export const catalogPlugin = (config?: Partial<CatalogConfig>) =>
  definePlugin({
    name: CATALOG_PLUGIN,
    title: '著录面板',
    inject: [FIELDS_SERVICE],
    Config: CatalogConfigSchema,
    config,
    setup(ctx, options) {
      const { kernel } = ctx;
      const fields = kernel.services.get(FIELDS_SERVICE);
      const groups = fields.groups();
      ctx.registerSlice(catalogSlice, {
        collapsed: Object.fromEntries(groups.map((g) => [g.key, !!g.collapsed])),
        more: {},
      });

      const allCollapsed = () => groups.length > 0 && groups.every((g) => kernel.getState().catalog.collapsed[g.key]);
      ctx.registerCommand({
        id: 'catalog.toggleAll',
        title: '整体收起 / 展开',
        icon: 'fold',
        checked: () => allCollapsed(),
        run: () => kernel.dispatch(catalogActions.setAll({ groups: groups.map((g) => g.key), collapsed: !allCollapsed() })),
      });

      ctx.contribute(ExtensionPoints.panels, {
        id: 'catalog.panel',
        region: options.region,
        title: options.title,
        icon: 'list',
        order: options.order,
        view: () => <CatalogPanel kernel={kernel} fields={fields} columns={options.columns} />,
        actions: [
          { id: 'catalog.validate', icon: 'validate', tooltip: '校验', command: 'fields.validate' },
          { id: 'catalog.confirmAll', icon: 'success', tooltip: '全部确认（复核）', command: 'fields.confirmAll' },
          { id: 'catalog.toggleAll', icon: 'fold', tooltip: '整体收起 / 展开', command: 'catalog.toggleAll' },
        ],
      });

      // 状态栏：必填完成度与待复核数
      const required = groups.flatMap((g) => g.fields).filter((f) => f.required);
      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'catalog.progress',
        align: 'left',
        order: 20,
        icon: 'list',
        text: (s) => {
          const values = s.fields?.values ?? {};
          const filled = required.filter((f) => {
            const v = values[f.key]?.value;
            return v != null && v !== '' && !(Array.isArray(v) && !v.length);
          }).length;
          const pending = Object.values(values).filter((v) => v.review === 'pending').length;
          if (!required.length && !pending) return null;
          return [required.length && `必填 ${filled}/${required.length}`, pending && `待复核 ${pending}`].filter(Boolean).join(' · ');
        },
        tone: (s) => (Object.values(s.fields?.values ?? {}).some((v) => v.review === 'pending') ? 'warning' : 'default'),
        command: 'fields.confirmAll',
        tooltip: '点击全部确认',
      });
    },
  });
