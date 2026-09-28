/**
 * 示例插件：档号生成（编译期注册）。
 *
 * 演示：插件配置、依赖声明、命令 + 快捷键、工具栏按钮、状态栏项、
 *       通过服务令牌调用其他插件能力、事件派发、单元测试。
 *
 * 档号规则（示意）：全宗号-WS·年度-保管期限代码-件号(4 位)，如 `J012-WS·2024-Y-0015`
 */
import { definePlugin, ExtensionPoints, METADATA_PLUGIN, METADATA_SERVICE, type KabelState } from '@kabel/editor';

export interface ArchiveCodeOptions {
  /** 档号写入的字段 */
  target?: string;
  /** 门类代码，默认 WS（文书） */
  category?: string;
  retentionCodes?: Record<string, string>;
}

declare module '@kabel/editor' {
  interface KabelEvents {
    'archive-code:generated': { code: string };
  }
}

const DEFAULT_RETENTION: Record<string, string> = { 永久: 'Y', 定期30年: 'D30', 定期10年: 'D10' };

export function computeArchiveCode(values: Record<string, unknown>, options: ArchiveCodeOptions = {}): string | null {
  const { fonds, year, retention, itemNo } = values as Record<string, string | number | undefined>;
  const code = (options.retentionCodes ?? DEFAULT_RETENTION)[String(retention ?? '')];
  if (!fonds || !year || !code || itemNo == null || itemNo === '') return null;
  return `${fonds}-${options.category ?? 'WS'}·${year}-${code}-${String(itemNo).padStart(4, '0')}`;
}

export const archiveCodePlugin = (options: ArchiveCodeOptions = {}) =>
  definePlugin({
    name: 'example:archive-code',
    dependencies: [METADATA_PLUGIN],
    setup(ctx) {
      const target = options.target ?? 'archiveCode';
      const pending = (s: KabelState) => {
        const next = computeArchiveCode(s.record.values, options);
        return next && next !== s.record.values[target] ? next : null;
      };

      ctx.registerCommand({
        id: 'archiveCode.generate',
        title: '生成档号',
        keybinding: 'Mod+Shift+G',
        enabled: (k) => !k.getState().metadata.readonly && !!pending(k.getState()),
        run: (k) => {
          const code = pending(k.getState());
          if (!code) return null;
          k.services.get(METADATA_SERVICE).setValue(target, code, '生成档号');
          k.bus.emit('archive-code:generated', { code });
          return code;
        },
      });

      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'archiveCode.generate',
        icon: 'hash',
        label: '生成档号',
        command: 'archiveCode.generate',
        order: 31,
      });

      ctx.contribute(ExtensionPoints.statusbar, {
        id: 'archiveCode.pending',
        order: 40,
        icon: 'hash',
        text: (s) => {
          const next = pending(s);
          return next ? `档号待更新：${next}` : null;
        },
        tone: () => 'warning',
        tooltip: '点击生成档号',
        command: 'archiveCode.generate',
      });
    },
  });
