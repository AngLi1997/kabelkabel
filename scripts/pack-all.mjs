// 将所有发布包打成 tarball 到 .packs/，workspace:* 依赖会被替换为真实版本号，
// 可用于在任意项目中验证 `npm install ./path/to/xxx.tgz`。
// 包含 packages/* 与扩展插件目录 packages/plugins/*（只处理带 package.json 的目录）。
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('.packs');
mkdirSync(out, { recursive: true });

const packageDirs = (root) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(resolve(root, e.name, 'package.json')))
        .map((e) => resolve(root, e.name))
    : [];

for (const dir of [...packageDirs('packages'), ...packageDirs('packages/plugins')]) {
  execSync(`pnpm pack --pack-destination ${out}`, { cwd: dir, stdio: 'inherit' });
}
console.log(`packed → ${out}`);
