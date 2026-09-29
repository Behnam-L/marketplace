import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const contracts = fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@bajet/contracts': contracts } },
  server: {
    port: 5173,
    proxy: { '/v1': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3000', changeOrigin: false } },
  },
  build: { sourcemap: true, outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
