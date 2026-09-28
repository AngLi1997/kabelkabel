import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: {
    alias: [
      { find: '@kabel/core/testing', replacement: pkg('core/src/testing.ts') },
      { find: /^@kabel\/(core|ui|editor|vue)$/, replacement: pkg('$1/src/index.ts') },
      { find: /^@kabel\/(plugin-[a-z]+)$/, replacement: pkg('$1/src/index.ts') },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'examples/plugins/**/*.test.ts'],
  },
});
