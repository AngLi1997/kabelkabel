import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: {
    alias: [
      { find: '@kabel/core/testing', replacement: pkg('core/src/testing.ts') },
      { find: /^@kabel\/(core|ui|editor|vue)$/, replacement: pkg('$1/src/index.ts') },
      // 扩展插件统一放在 packages/plugins/<name>，包名 @kabel/plugin-<name>
      { find: /^@kabel\/plugin-([a-z0-9-]+)$/, replacement: pkg('plugins/$1/src/index.ts') },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'packages/plugins/*/test/**/*.test.{ts,tsx}'],
  },
});
