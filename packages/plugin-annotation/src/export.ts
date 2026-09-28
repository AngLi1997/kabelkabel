import type { ImageItem } from '@kabel/plugin-viewer';
import type { AnnotationDocument, AnnotationLabel, AnnotationMap, ImageSize } from './types';

/** 生成 JSON 导出文档：包含当前影像列表中的每张图片（无标记的为空数组） */
export function toDocument(
  map: AnnotationMap,
  labels: AnnotationLabel[],
  images: readonly Pick<ImageItem, 'id' | 'name'>[],
  sizes: Record<string, ImageSize>,
): AnnotationDocument {
  const names = new Map(labels.map((l) => [l.id, l.name]));
  return {
    labels: labels.map((l) => ({ ...l })),
    images: images.map((image) => ({
      id: image.id,
      name: image.name,
      ...sizes[image.id],
      annotations: (map[image.id] ?? []).map((a) => ({
        id: a.id,
        label: names.get(a.label) ?? a.label,
        bbox: [a.x, a.y, a.w, a.h] as [number, number, number, number],
      })),
    })),
  };
}

/** 解析 JSON 文档；标记类型按 id 或名称匹配，无法匹配的标记被丢弃 */
export function fromDocument(
  doc: AnnotationDocument,
  labels: AnnotationLabel[],
  createId: () => string,
): { annotations: AnnotationMap; sizes: Record<string, ImageSize> } {
  const byKey = new Map<string, string>();
  for (const l of labels) {
    byKey.set(l.name, l.id);
    byKey.set(l.id, l.id);
  }
  const annotations: AnnotationMap = {};
  const sizes: Record<string, ImageSize> = {};
  for (const image of doc.images ?? []) {
    if (image.width && image.height) sizes[image.id] = { width: image.width, height: image.height };
    const list = (image.annotations ?? []).flatMap((a) => {
      const label = byKey.get(a.label);
      const [x, y, w, h] = a.bbox ?? [];
      if (!label || ![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n)) || w! <= 0 || h! <= 0) return [];
      return [{ id: a.id ?? createId(), label, x: x!, y: y!, w: w!, h: h! }];
    });
    if (list.length) annotations[image.id] = list;
  }
  return { annotations, sizes };
}

const round = (n: number) => Number(n.toFixed(6));

/** 导出文件名：带扩展名的图片名取主干，否则使用图片 id；重名时追加序号 */
function stems(images: readonly Pick<ImageItem, 'id' | 'name'>[]): string[] {
  const used = new Set<string>();
  return images.map((image) => {
    const match = /^(.+)\.[a-z0-9]{2,5}$/i.exec(image.name);
    const base = (match ? match[1]! : image.id).replace(/[\\/:*?"<>|\s]+/g, '_');
    let stem = base;
    for (let i = 2; used.has(stem); i += 1) stem = `${base}_${i}`;
    used.add(stem);
    return stem;
  });
}

/**
 * YOLO 格式：`classes.txt`、`data.yaml` 与每张图片一个 `labels/<名称>.txt`，
 * 每行 `类别序号 中心x 中心y 宽 高`（按图片尺寸归一化到 0–1）。有标记但尺寸未知的图片跳过。
 */
export function toYolo(
  map: AnnotationMap,
  labels: AnnotationLabel[],
  images: readonly Pick<ImageItem, 'id' | 'name'>[],
  sizes: Record<string, ImageSize>,
): Record<string, string> {
  const index = new Map(labels.map((l, i) => [l.id, i]));
  const files: Record<string, string> = {
    'classes.txt': labels.map((l) => l.name).join('\n') + '\n',
    'data.yaml': `nc: ${labels.length}\nnames:\n${labels.map((l, i) => `  ${i}: ${JSON.stringify(l.name)}`).join('\n')}\n`,
  };
  const names = stems(images);
  images.forEach((image, i) => {
    const size = sizes[image.id];
    const list = map[image.id] ?? [];
    if (list.length && !size) return;
    const lines = list.flatMap((a) => {
      const cls = index.get(a.label);
      if (cls === undefined || !size) return [];
      const values = [(a.x + a.w / 2) / size.width, (a.y + a.h / 2) / size.height, a.w / size.width, a.h / size.height];
      return [`${cls} ${values.map(round).join(' ')}`];
    });
    files[`labels/${names[i]}.txt`] = lines.length ? lines.join('\n') + '\n' : '';
  });
  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 打包为不压缩（store）的 zip，文件名使用 UTF-8 */
export function createZip(files: Record<string, string>, date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const count = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
