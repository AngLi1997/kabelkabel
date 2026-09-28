/** 拼接 className，忽略假值 */
export function cx(...parts: unknown[]): string {
  return parts.filter((p) => typeof p === 'string' && p).join(' ');
}

/** 触发浏览器下载 */
export function downloadFile(name: string, content: BlobPart, type: string, doc: Document | undefined = globalThis.document): void {
  if (!doc) return;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
