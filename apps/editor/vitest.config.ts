import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  css: { postcss: { plugins: [] } },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'jsdom', globals: true, setupFiles: [fileURLToPath(new URL('./tests/setup.ts', import.meta.url))] },
  resolve: { conditions: ['development', 'browser'] },
});
