/**
 * 示例插件：档号生成（编译期注册）。
 *
 * 演示：插件配置、依赖声明、命令 + 快捷键、工具栏按钮、状态栏项、
 *       通过服务令牌调用其他插件能力、事件派发（类型扩充）、单元测试。
 */
import { definePlugin, ExtensionPoints, METADATA_PLUGIN, METADATA_SERVICE, type KabelState } from '@kabel/editor';
import { computeArchiveCode, type ArchiveCodeOptions } from './rules';

declare module '@kabel/editor' {
  interface KabelEvents {
    'archive-code:generated': { code: string };
  }
}

export const ARCHIVE_CODE_PLUGIN = 'example:archive-code';

export const archiveCodePlugin = (options: ArchiveCodeOptions = {}) =>
  definePlugin({
    name: ARCHIVE_CODE_PLUGIN,
    title: '档号生成',
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
