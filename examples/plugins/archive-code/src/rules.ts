/** 档号规则（示意）：全宗号-门类·年度-保管期限代码-件号(4 位)，如 `J012-WS·2024-Y-0015` */

export interface ArchiveCodeOptions {
  /** 档号写入的字段 */
  target?: string;
  /** 门类代码，默认 WS（文书） */
  category?: string;
  /** 保管期限 → 代码，默认 永久 Y / 定期30年 D30 / 定期10年 D10 */
  retentionCodes?: Record<string, string>;
}

const DEFAULT_RETENTION: Record<string, string> = { 永久: 'Y', 定期30年: 'D30', 定期10年: 'D10' };

/** 按规则拼接档号；信息不全时返回 null */
export function computeArchiveCode(values: Record<string, unknown>, options: ArchiveCodeOptions = {}): string | null {
  const { fonds, year, retention, itemNo } = values as Record<string, string | number | undefined>;
  const code = (options.retentionCodes ?? DEFAULT_RETENTION)[String(retention ?? '')];
  if (!fonds || !year || !code || itemNo == null || itemNo === '') return null;
  return `${fonds}-${options.category ?? 'WS'}·${year}-${code}-${String(itemNo).padStart(4, '0')}`;
}
