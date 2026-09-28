// 将所有发布包打成 tarball 到 .packs/，workspace:* 依赖会被替换为真实版本号，
// 可用于在任意项目中验证 `npm install ./path/to/xxx.tgz`。
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('.packs');
mkdirSync(out, { recursive: true });
for (const dir of readdirSync('packages')) {
  execSync(`pnpm pack --pack-destination ${out}`, { cwd: resolve('packages', dir), stdio: 'inherit' });
}
console.log(`packed → ${out}`);
