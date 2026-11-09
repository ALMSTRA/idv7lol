import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@idv7lol/theme-schema': r('./packages/theme-schema/src/index.ts'),
      '@idv7lol/vehicle-signals': r('./packages/vehicle-signals/src/index.ts'),
      '@idv7lol/theme-engine': r('./packages/theme-engine/src/index.ts'),
      '@idv7lol/simulator': r('./packages/simulator/src/index.ts'),
      '@idv7lol/theme-compiler': r('./packages/theme-compiler/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
    },
  },
});
