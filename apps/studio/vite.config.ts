import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
