import { definePlugin, ExtensionPoints, NOTIFY_SERVICE, Schema } from '@kabel/core';
import { FieldExtensions, FIELDS_SERVICE, type FieldType } from '@kabel/plugin-fields';
import { OCR_SERVICE } from '@kabel/plugin-ocr';
import { REGION_SERVICE } from '@kabel/plugin-region-select';
import { WORKSPACE_SERVICE, WorkspaceExtensions } from '@kabel/plugin-workspace';
import { EvidenceOverlay } from './EvidenceOverlay';
import { excerptActions, excerptSlice } from './slice';

export interface ExcerptConfig {
  shape: 'rect' | 'polygon';
  autoNext: boolean;
  review: boolean;
  revealOnFocus: boolean;
}

export const ExcerptConfigSchema: Schema<Partial<ExcerptConfig>, ExcerptConfig> = Schema.object({
  shape: Schema.union([Schema.const('rect').description('矩形'), Schema.const('polygon').description('多边形')])
    .default('rect')
    .description('框选形状'),
  autoNext: Schema.boolean().default(true).description('回填后跳到下一个字段'),
  review: Schema.boolean().default(false).description('识别结果标记为待复核'),
  revealOnFocus: Schema.boolean().default(true).description('选中字段时定位到证据所在页'),
}) as never;

export const EXCERPT_PLUGIN = 'kabel:ocr-excerpt';
/** 框选请求的 origin：结果不进入“框选结果”面板，也不会被其他订阅 `region:select` 的插件误收 */
export const EXCERPT_ORIGIN = 'kabel:ocr-excerpt';

const OCR_TYPES: FieldType[] = ['text', 'textarea', 'date', 'number', 'select', 'radio'];

/**
 * 框选识别回填（业务插件）：选中字段 → 在影像上框选区域 → OCR 识别 → 按字段类型规整后回填，
 * 并把框选位置记为字段证据（影像上显示字段名虚线框，点击字段的“定位”回到该位置）。
 *
 * 只依赖服务：工作台、字段模型、框选、文字识别；任一服务缺失时插件处于等待状态，按钮不出现。
 */
export const ocrExcerptPlugin = (config?: Partial<ExcerptConfig>) =>
  definePlugin({
    name: EXCERPT_PLUGIN,
    title: '框选识别回填',
    inject: [WORKSPACE_SERVICE, FIELDS_SERVICE, REGION_SERVICE, OCR_SERVICE],
    Config: ExcerptConfigSchema,
    config,
    setup(ctx, options) {
      const { kernel } = ctx;
      const workspace = kernel.services.get(WORKSPACE_SERVICE);
      const fields = kernel.services.get(FIELDS_SERVICE);
      const region = kernel.services.get(REGION_SERVICE);
      const ocr = kernel.services.get(OCR_SERVICE);
      const notify = (message: string, type: 'warning' | 'error' | 'success' = 'warning') =>
        kernel.services.tryGet(NOTIFY_SERVICE)?.notify(message, { type, duration: type === 'success' ? 2000 : undefined });

      ctx.registerSlice(excerptSlice);
      let generation = 0;
      ctx.onDispose(() => {
        generation += 1;
      });

      const ocrable = (key: string) => {
        const field = fields.field(key);
        return !!field && field.ocr !== false && OCR_TYPES.includes(field.type);
      };
      const firstEmpty = () => fields.fields().find((f) => ocrable(f.key) && fields.get(f.key)?.value == null)?.key;

      async function pick(key?: string) {
        const target = key ?? fields.focused() ?? firstEmpty();
        if (!target || !ocrable(target)) {
          notify('请先选择要回填的字段');
          return;
        }
        const label = fields.field(target)!.label;
        const current = ++generation;
        fields.focus(target);
        kernel.dispatch(excerptActions.start(target));
        try {
          const selection = await region.pick({ origin: EXCERPT_ORIGIN, shape: options.shape });
          if (current !== generation) return;
          if (!selection?.crop) {
            kernel.dispatch(excerptActions.done());
            return;
          }
          kernel.dispatch(excerptActions.recognizing());
          const { text } = await ocr.recognize(selection.crop.blob, { task: 'text' });
          if (current !== generation) return;
          if (!text.trim()) {
            kernel.dispatch(excerptActions.done());
            notify(`未识别到「${label}」的文字`);
            return;
          }
          fields.set(target, text, {
            source: 'ocr',
            review: options.review ? 'pending' : undefined,
            evidence: { documentId: selection.document.id, bbox: selection.bbox, text },
            label: `识别填写${label}`,
          });
          kernel.dispatch(excerptActions.done());
          ctx.bus.emit('excerpt:fill', { key: target, text, documentId: selection.document.id });
          if (options.autoNext) fields.next();
        } catch (error) {
          if (current !== generation) return;
          const message = error instanceof Error ? error.message : String(error);
          kernel.dispatch(excerptActions.fail(message));
          notify(`识别失败：${message}`, 'error');
        }
      }

      ctx.registerCommand({
        id: 'excerpt.pick',
        title: 'OCR 框选',
        icon: 'ocr',
        keybinding: 'Mod+O',
        mutates: true,
        enabled: () => workspace.current()?.kind === 'image' && fields.fields().length > 0,
        checked: (k) => k.getState().excerpt?.phase !== 'idle',
        run: (k, key?: string) => {
          // 框选中再次触发：取消（与工具条按钮的切换语义一致）
          if (k.getState().excerpt.phase === 'picking' && typeof key !== 'string') {
            generation += 1;
            region.deactivate();
            kernel.dispatch(excerptActions.done());
            return;
          }
          return pick(typeof key === 'string' ? key : undefined);
        },
      });

      ctx.contribute(ExtensionPoints.toolbar, {
        id: 'excerpt.pick',
        icon: 'ocr',
        label: 'OCR 框选',
        showLabel: true,
        showKeybinding: true,
        command: 'excerpt.pick',
        order: 40,
      });
      ctx.contribute(FieldExtensions.actions, {
        id: 'excerpt.field',
        icon: 'ocr',
        title: '框选识别',
        command: 'excerpt.pick',
        order: 10,
        when: (field) => field.ocr !== false && OCR_TYPES.includes(field.type),
      });
      ctx.contribute(ExtensionPoints.banners, {
        id: 'excerpt.status',
        order: 20,
        icon: 'ocr',
        tone: 'info',
        text: (s) => {
          const state = s.excerpt;
          if (!state || state.phase === 'idle') return null;
          const label = fields.field(state.target ?? '')?.label ?? '';
          return state.phase === 'picking' ? `请在影像上框选「${label}」所在区域（Esc 取消）` : `正在识别「${label}」…`;
        },
      });
      ctx.contribute(WorkspaceExtensions.overlays, {
        id: 'excerpt.evidence',
        order: 90,
        view: (props) => <EvidenceOverlay {...props} fields={fields} />,
      });

      // 框选被取消（Esc、被其他工具抢占）
      ctx.on('region:cancel', ({ origin }) => {
        if (origin === EXCERPT_ORIGIN && kernel.getState().excerpt.phase === 'picking') kernel.dispatch(excerptActions.done());
      });

      if (options.revealOnFocus) {
        ctx.on('field:focus', ({ key }) => {
          const evidence = key ? fields.get(key)?.evidence : undefined;
          if (evidence && evidence.documentId !== workspace.current()?.id) workspace.reveal(evidence.documentId, evidence.bbox);
        });
      }
    },
  });
