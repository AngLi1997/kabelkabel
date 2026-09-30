import type { ImageSourceInput } from '@kabel/vue';

/** 生成一页模拟的“红头文件”扫描件（SVG），用于演示 */
export function makePageSvg(page: number, title: string): string {
  const lines = Array.from({ length: 16 }, (_, i) => {
    const w = i % 5 === 4 ? 260 : 460 - ((i * 37) % 60);
    return `<rect x="70" y="${330 + i * 26}" width="${w}" height="8" fill="#9aa0a8" opacity="0.55"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="848" viewBox="0 0 600 848">
<rect width="600" height="848" fill="#fbfaf6"/>
<text x="300" y="120" font-size="40" text-anchor="middle" fill="#c8161d" font-family="serif" letter-spacing="4">示例市档案局文件</text>
<text x="300" y="175" font-size="16" text-anchor="middle" fill="#333" font-family="serif">示档发〔2024〕${page + 10}号</text>
<rect x="60" y="195" width="480" height="3" fill="#c8161d"/>
<text x="300" y="265" font-size="22" text-anchor="middle" fill="#222" font-family="serif">${title}</text>
${lines}
<text x="300" y="800" font-size="14" text-anchor="middle" fill="#666">— ${page} —</text>
</svg>`;
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

/** 同一套影像以四种不同的参数格式传入，演示多种数据源；group 为所属目录，文件目录按目录分组 */
export function sampleImages(title: string): ImageSourceInput[] {
  return [
    // 1. URL（静态资源）
    { url: '/scans/page-1.svg', name: '0001.svg', group: '正文' },
    // 2. base64（无 data: 前缀，自动识别 MIME；也可直接传纯 base64 字符串）
    { base64: toBase64(makePageSvg(2, title)), name: '0002.svg', group: '正文' },
    // 3. Blob
    { blob: new Blob([makePageSvg(3, title)], { type: 'image/svg+xml' }), name: '0003.svg', group: '附件' },
    // 4. 异步加载器（如需鉴权下载的影像）
    async () => {
      const res = await fetch('/scans/page-4.svg');
      return { blob: await res.blob(), name: '0004.svg', group: '处理单' };
    },
  ];
}
