import type { ImageItem } from '@kabel/plugin-workspace';
import type { CropImage, CropRequest, RegionCropper } from './contract';

const MAX_CACHED = 3;

/** 取最近使用的若干项，超出时淘汰最早的 */
function remember<V>(cache: Map<string, V>, key: string, value: V, onEvict?: (v: V) => void) {
  cache.set(key, value);
  while (cache.size > MAX_CACHED) {
    const [oldest] = cache.keys();
    onEvict?.(cache.get(oldest!)!);
    cache.delete(oldest!);
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

/**
 * 解码图片。优先 `createImageBitmap`（不占用主线程、速度快）；它不支持 SVG 等格式
 * （Chrome 会抛 InvalidStateError），此时回退到 `<img>` 解码，由浏览器按自然尺寸光栅化。
 */
async function decode(blob: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('无法解码该图片');
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      throw new Error('图片没有固有尺寸，无法裁剪');
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  }
}

/**
 * 默认裁剪器：`fetch` 取得原图 Blob，`createImageBitmap` 解码后在 canvas 上裁剪。
 * 原图 Blob 与解码结果按 `src` 缓存最近几张，连续框选同一页不重复解码。
 * 跨域图片需服务端允许 CORS，否则 `fetch` 会失败并由框选插件转为 `region:error`。
 */
export function createCanvasCropper(): RegionCropper {
  const blobs = new Map<string, Promise<Blob>>();
  const decoded = new Map<string, Promise<Decoded>>();

  const original = (image: ImageItem): Promise<Blob> => {
    let task = blobs.get(image.src);
    if (!task) {
      task = fetch(image.src).then((response) => {
        if (!response.ok) throw new Error(`加载原图失败（${response.status}）`);
        return response.blob();
      });
      task.catch(() => blobs.delete(image.src));
      remember(blobs, image.src, task);
    }
    return task;
  };

  const source = (image: ImageItem): Promise<Decoded> => {
    let task = decoded.get(image.src);
    if (!task) {
      task = original(image).then(decode);
      task.catch(() => decoded.delete(image.src));
      remember(decoded, image.src, task, (t) => void t.then((d) => d.release()).catch(() => {}));
    }
    return task;
  };

  const crop = async (request: CropRequest): Promise<CropImage> => {
    const image = await source(request.image);
    const x = Math.min(Math.max(0, request.bbox.x), image.width);
    const y = Math.min(Math.max(0, request.bbox.y), image.height);
    const width = Math.min(request.bbox.width, image.width - x);
    const height = Math.min(request.bbox.height, image.height - y);
    if (width <= 0 || height <= 0) throw new Error('选区不在图片范围内');

    const mime = request.options.mime ?? 'image/png';
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error('当前环境不支持 canvas');

    if (mime === 'image/jpeg') {
      context.fillStyle = request.options.background ?? '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    if (request.mode === 'clip' && request.clip) {
      request.clip(context);
      context.clip();
    }
    context.drawImage(image.source, x, y, width, height, 0, 0, width, height);

    const blob =
      canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出裁剪图失败'))), mime, request.options.quality),
          )
        : await canvas.convertToBlob({ type: mime, quality: request.options.quality });
    return { blob, mime, width, height };
  };

  return { original, crop };
}
