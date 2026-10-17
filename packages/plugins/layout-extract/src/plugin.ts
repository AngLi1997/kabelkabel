import { definePlugin, ExtensionPoints, NOTIFY_SERVICE, Schema } from '@kabel/core';
import { FIELDS_SERVICE, isEmptyValue } from '@kabel/plugin-fields';
import { LLM_SERVICE } from '@kabel/plugin-llm';
import { OCR_SERVICE } from '@kabel/plugin-ocr';
import { WORKSPACE_SERVICE, type DocumentItem } from '@kabel/plugin-workspace';
import { buildUserPrompt, DEFAULT_SYSTEM_PROMPT, type PageText } from './prompt';
import { layoutExtractActions, layoutExtractSlice } from './slice';

export interface LayoutExtractConfig {
  scope: 'current' | 'group' | 'all';
  maxPages: number;
  overwrite: 'empty' | 'ai' | 'all';
  review: boolean;
  autoRun: boolean;
  systemPrompt: string;
}

export const LayoutExtractConfigSchema: Schema<Partial<LayoutExtractConfig>, LayoutExtractConfig> = Schema.object({
  scope: Schema.union([
    Schema.const('current').description('当前页'),
    Schema.const('group').description('当前材料项（同目录的页）'),
    Schema.const('all').description('全部文件'),
  ])
    .default('current')
    .description('分析范围'),
  maxPages: Schema.natural().min(1).default(6).description('最多分析页数'),
  overwrite: Schema.union([
    Schema.const('empty').description('只填空字段'),
    Schema.const('ai').description('只覆盖上次 AI 结果'),
    Schema.const('all').description('全部覆盖'),
  ])
    .default('ai')
    .description('回填策略'),
  review: Schema.boolean().default(true).description('回填结果标记为待复核'),
  autoRun: Schema.boolean().default(false).description('打开文件后自动分析'),
  systemPrompt: Schema.string().role('textarea').default(DEFAULT_SYSTEM_PROMPT).description('提取指令'),
}) as never;

export const LAYOUT_EXTRACT_PLUGIN = 'kabel:layout-extract';

/**
 * 版面分析自动填充（业务插件）：对选定范围的页做整页识别（OCR），再由大模型按字段配置做结构化提取，
 * 结果以“AI 已填入 · 待复核”回填字段模型。
 *
 * 只依赖服务：工作台、字段模型、文字识别、大模型。识别与模型地址在各自插件的配置中设置。
 */
export const layoutExtractPlugin = (config?: Partial<LayoutExtractConfig>) =>
  definePlugin({
    name: LAYOUT_EXTRACT_PLUGIN,
    title: '版面分析自动填充',
    inject: [WORKSPACE_SERVICE, FIELDS_SERVICE, OCR_SERVICE, LLM_SERVICE],
    Config: LayoutExtractConfigSchema,
    config,
    setup(ctx, options) {
      const { kernel } = ctx;
      const workspace = kernel.services.get(WORKSPACE_SERVICE);
      const fields = kernel.services.get(FIELDS_SERVICE);
      const ocr = kernel.services.get(OCR_SERVICE);
      const llm = kernel.services.get(LLM_SERVICE);
      const notify = (message: string, type: 'warning' | 'error' | 'success') =>
        kernel.services.tryGet(NOTIFY_SERVICE)?.notify(message, { type, duration: type === 'error' ? undefined : 2500 });

      ctx.registerSlice(layoutExtractSlice);
      let controller: AbortController | null = null;
      ctx.onDispose(() => controller?.abort());
      const running = () => ['ocr', 'llm'].includes(kernel.getState().layoutExtract.status);

      const pages = (): DocumentItem[] => {
        const current = workspace.current();
        if (!current) return [];
        const images = workspace.getDocuments().filter((d) => d.kind === 'image');
        const picked =
          options.scope === 'current'
            ? [current]
            : options.scope === 'group'
              ? images.filter((d) => (d.group ?? '') === (current.group ?? ''))
              : images;
        return picked.slice(0, options.maxPages);
      };

      async function run() {
        const targets = pages();
        const defs = fields.fields();
        if (!targets.length || !defs.length) return;
        controller?.abort();
        const abort = new AbortController();
        controller = abort;
        const { signal } = abort;
        kernel.dispatch(layoutExtractActions.start(targets.length));
        try {
          const texts: PageText[] = [];
          for (const [i, doc] of targets.entries()) {
            const blob = await workspace.readBlob(doc);
            const { text } = await ocr.recognize(blob, { task: 'page', signal });
            if (signal.aborted) return;
            texts.push({ name: doc.name, text });
            kernel.dispatch(layoutExtractActions.progress(i + 1));
          }
          kernel.dispatch(layoutExtractActions.extracting());
          const result = await llm.json<Record<string, unknown>>(
            [
              { role: 'system', content: options.systemPrompt },
              { role: 'user', content: buildUserPrompt(defs, texts) },
            ],
            { signal },
          );
          if (signal.aborted) return;

          const entries: Record<string, unknown> = {};
          for (const field of defs) {
            let value = result[field.key] ?? result[field.label];
            if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) value = (value as { value: unknown }).value;
            if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
            const current = fields.get(field.key);
            const filled = current && !isEmptyValue(current.value);
            if (filled && options.overwrite === 'empty') continue;
            // 人工输入、宿主载入与框选识别（人工指定区域）的值不被智能提取覆盖
            if (filled && options.overwrite === 'ai' && current.source !== 'ai') continue;
            entries[field.key] = value;
          }
          const single = targets.length === 1 ? targets[0]!.id : undefined;
          const filled = fields.setMany(entries, {
            source: 'ai',
            review: options.review ? 'pending' : undefined,
            evidence: single ? { documentId: single } : undefined,
            label: '版面分析回填',
          });
          kernel.dispatch(layoutExtractActions.done(filled));
          ctx.bus.emit('layout-extract:done', { values: result, filled, documentIds: targets.map((d) => d.id) });
          notify(filled.length ? `版面分析完成，回填 ${filled.length} 个字段` : '版面分析完成，没有可回填的字段', filled.length ? 'success' : 'warning');
        } catch (error) {
          if (signal.aborted) return;
          const message = error instanceof Error ? error.message : String(error);
          kernel.dispatch(layoutExtractActions.fail(message));
          notify(`版面分析失败：${message}`, 'error');
        } finally {
          if (controller === abort) controller = null;
        }
      }

      ctx.registerCommand({
        id: 'layoutExtract.run',
        title: '版面分析',
        icon: 'layout-analysis',
        keybinding: 'Mod+Shift+E',
        mutates: true,
        enabled: () => !running() && workspace.current()?.kind === 'image' && fields.fields().length > 0,
        run: () => run(),
      });
      ctx.registerCommand({
        id: 'layoutExtract.cancel',
        title: '取消版面分析',
        enabled: () => running(),
        run: () => {
          controller?.abort();
          controller = null;
          kernel.dispatch(layoutExtractActions.reset());
        },
      });

      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'layoutExtract.run',
        icon: 'layout-analysis',
        label: '版面分析',
        showLabel: true,
        showKeybinding: true,
        command: 'layoutExtract.run',
        order: 41,
      });
      ctx.contribute(ExtensionPoints.banners, {
        id: 'layoutExtract.status',
        order: 10,
        icon: 'sparkles',
        text: (s) => {
          const st = s.layoutExtract;
          if (!st) return null;
          if (st.status === 'ocr') return `智能算法调用中：OCR 识别 ${st.done}/${st.total} 页…`;
          if (st.status === 'llm') return '智能算法调用中：结构化数据提取…';
          if (st.status === 'error') return `版面分析失败：${st.message}`;
          if (st.status === 'done') {
            const pending = st.filled.filter((k) => s.fields?.values[k]?.review === 'pending').length;
            return `智能算法已调用（OCR / 版面分析 / 结构化数据提取）：回填 ${st.filled.length} 个字段${pending ? `，待复核 ${pending}` : ''}`;
          }
          return null;
        },
        tone: (s) => (s.layoutExtract?.status === 'error' ? 'danger' : s.layoutExtract?.status === 'done' ? 'success' : 'info'),
        action: { label: '重新分析', command: 'layoutExtract.run' },
      });

      if (options.autoRun) {
        ctx.watch(
          (s) => s.documents?.items,
          (items) => {
            if (items?.length) void run();
          },
        );
      }
    },
  });
