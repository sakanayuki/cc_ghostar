import { defineConfig } from 'vitest/config';

const srcDir = new URL('./src', import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: { '@': srcDir },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
