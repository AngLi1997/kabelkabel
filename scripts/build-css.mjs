// 用法：node build-css.mjs <output> <input...>
// 将多个 CSS 源文件按顺序拼接为一个产物文件（相对当前工作目录）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) {
  console.error('usage: build-css <output> <input...>');
  process.exit(1);
}
const banner = '/* Kabel — scoped under .kb-root, does not affect host styles */\n';
const css = inputs.map((file) => `/* ${file} */\n${readFileSync(resolve(file), 'utf8').trim()}\n`).join('\n');
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(resolve(output), banner + css);
console.log(`css → ${output} (${inputs.length} files)`);
