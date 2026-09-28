/** 拼接 className，忽略假值 */
export function cx(...parts: unknown[]): string {
  return parts.filter((p) => typeof p === 'string' && p).join(' ');
}
