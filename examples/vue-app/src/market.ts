import type { ImageSourceInput } from '@kabel/vue';

/** 模拟的市场监管登记材料扫描件（SVG），用于演示框选识别与版面分析 */
function page(title: string, rows: [string, string][], no: number): string {
  const body = rows
    .map(
      ([k, v], i) =>
        `<rect x="60" y="${210 + i * 52}" width="480" height="52" fill="none" stroke="#555" stroke-width="1"/>` +
        `<line x1="200" y1="${210 + i * 52}" x2="200" y2="${262 + i * 52}" stroke="#555"/>` +
        `<text x="130" y="${242 + i * 52}" font-size="16" text-anchor="middle" fill="#222" font-family="serif">${k}</text>` +
        `<text x="215" y="${242 + i * 52}" font-size="16" fill="#111" font-family="serif">${v}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="848" viewBox="0 0 600 848">
<rect width="600" height="848" fill="#fcfbf7"/>
<text x="300" y="120" font-size="28" text-anchor="middle" fill="#111" font-family="serif" letter-spacing="6">${title}</text>
<text x="300" y="160" font-size="15" text-anchor="middle" fill="#444" font-family="serif">四川星辰信息技术有限公司</text>
${body}
<circle cx="470" cy="${250 + rows.length * 52}" r="56" fill="none" stroke="#c8161d" stroke-width="3" opacity="0.8"/>
<text x="470" y="${256 + rows.length * 52}" font-size="13" text-anchor="middle" fill="#c8161d" opacity="0.85">成华区市场监督管理局</text>
<text x="300" y="810" font-size="13" text-anchor="middle" fill="#666">— ${no} —</text>
</svg>`;
}

const svg = (text: string) => new Blob([text], { type: 'image/svg+xml' });

/** 一份企业设立登记档案：按材料项分组（文件目录显示为“电子文件列表”的分组） */
export function marketImages(): ImageSourceInput[] {
  return [
    {
      name: '申请书-01.svg',
      group: '企业设立登记申请书',
      blob: svg(
        page(
          '企业设立登记申请书',
          [
            ['名称', '四川星辰信息技术有限公司'],
            ['统一社会信用代码', '915101085577261237'],
            ['类型', '有限责任公司（自然人投资或控股）'],
            ['住所', '成都市成华区建设路 55 号'],
            ['法定代表人', '张明'],
            ['注册资本', '100 万元人民币'],
            ['申请日期', '2026 年 08 月 11 日'],
          ],
          1,
        ),
      ),
    },
    {
      name: '申请书-02.svg',
      group: '企业设立登记申请书',
      blob: svg(
        page(
          '登记事项',
          [
            ['登记机关', '成都市成华区市场监督管理局'],
            ['事项', '企业登记注册（设立）'],
            ['受理日期', '2026 年 08 月 11 日'],
            ['核准日期', '2026 年 08 月 11 日'],
            ['注册号', '510108000000023'],
          ],
          2,
        ),
      ),
    },
    {
      name: '章程-01.svg',
      group: '公司章程',
      blob: svg(page('公司章程', [['第一条', '公司名称：四川星辰信息技术有限公司'], ['第二条', '公司住所：成都市成华区建设路 55 号']], 3)),
    },
    {
      name: '营业执照.svg',
      group: '营业执照',
      blob: svg(page('营业执照', [['统一社会信用代码', '915101085577261237'], ['成立日期', '2026 年 08 月 11 日']], 4)),
    },
  ];
}
