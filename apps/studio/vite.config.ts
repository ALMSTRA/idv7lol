import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const host = process.env.TAURI_DEV_HOST;

/**
 * `import x from './engine.js?car'` turns one of the car app's CommonJS files
 * (Node 8) into an ES module, so the Studio can run the car's own engine
 * without eval. Its `require('./name')` calls become imports of the same kind.
 */
function carModules(): Plugin {
  return {
    name: 'idv7lol-car-modules',
    load(id) {
      if (!id.endsWith('?car')) return null;
      const file = id.slice(0, -'?car'.length);
      const src = readFileSync(file, 'utf8');
      const deps = [...new Set([...src.matchAll(/require\('(\.\/[\w-]+)'\)/g)].map((m) => m[1]!))];
      const imports = deps
        .map((d, i) => `import __dep${i} from ${JSON.stringify(`${d}.js?car`)};`)
        .join('\n');
      const table = deps.map((d, i) => `${JSON.stringify(d)}: __dep${i}`).join(', ');
      return `${imports}
const __deps = { ${table} };
const module = { exports: {} };
const exports = module.exports;
function require(name) {
  const m = __deps[name.replace(/\\.js$/, '')];
  if (!m) throw new Error('car module not bundled: ' + name);
  return m;
}
${src}
export default module.exports;
`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), carModules()],
  clearScreen: false,
  resolve: {
    alias: {
      '@idv7lol/theme-schema': r('../../packages/theme-schema/src/index.ts'),
      '@idv7lol/vehicle-signals': r('../../packages/vehicle-signals/src/index.ts'),
      '@idv7lol/theme-engine': r('../../packages/theme-engine/src/index.ts'),
      '@idv7lol/simulator': r('../../packages/simulator/src/index.ts'),
      '@idv7lol/theme-compiler': r('../../packages/theme-compiler/src/index.ts'),
      '@': r('./src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
