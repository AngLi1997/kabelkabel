import type { FieldDefinition } from '@kabel/plugin-fields';

export const DEFAULT_SYSTEM_PROMPT = [
  '你是档案著录助手。根据档案影像的识别文本，按字段清单提取字段值。',
  '要求：',
  '1. 只输出一个 JSON 对象，键为字段清单中的 key，值为字符串（多选字段用数组）；',
  '2. 文本中找不到依据的字段不要输出，不要猜测；',
  '3. 日期统一为 YYYY-MM-DD；有可选值的字段只能取可选值之一；',
  '4. 保留原文用字，不要改写、翻译或补全。',
].join('\n');

export interface PageText {
  name: string;
  text: string;
}

const TYPE_LABEL: Record<string, string> = {
  text: '文本',
  textarea: '长文本',
  date: '日期',
  number: '数字',
  select: '单选',
  radio: '单选',
  checkbox: '多选',
};

/** 字段清单（给模型看的说明） */
export function describeFields(fields: readonly FieldDefinition[]): string {
  return fields
    .map((f) => {
      const parts = [TYPE_LABEL[f.type] ?? f.type];
      if (f.options?.length) parts.push(`可选值：${f.options.join(' / ')}`);
      if (f.hint) parts.push(`提示：${f.hint}`);
      return `- ${f.key}：${f.label}（${parts.join('；')}）`;
    })
    .join('\n');
}

export function buildUserPrompt(fields: readonly FieldDefinition[], pages: readonly PageText[]): string {
  const body = pages.map((p, i) => `=== 第 ${i + 1} 页：${p.name} ===\n${p.text}`).join('\n\n');
  return `字段清单：\n${describeFields(fields)}\n\n识别文本：\n${body}\n\n请输出 JSON：`;
}
