/** 识别服务通常只接受位图：SVG 等矢量图在浏览器中先绘制为 PNG（非浏览器环境原样返回） */
const RASTER = /^image\/(png|jpe?g|webp|bmp|gif|tiff?)$/;

export async function toRaster(blob: Blob): Promise<Blob> {
  if (!blob.type || RASTER.test(blob.type) || typeof document === 'undefined' || typeof Image === 'undefined') return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1000;
    canvas.height = img.naturalHeight || 1000;
    const g = canvas.getContext('2d');
    if (!g) return blob;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((png) => resolve(png ?? blob), 'image/png'));
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
