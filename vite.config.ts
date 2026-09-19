import { defineConfig } from 'vite';

const srcDir = new URL('./src', import.meta.url).pathname;

export default defineConfig({
  base: '/cc_ghostar/',
  resolve: {
    alias: { '@': srcDir },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // three は更新頻度が低い。別チャンクにしてキャッシュを効かせる
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules/three') ? 'three' : undefined;
        },
      },
    },
  },
  server: {
    host: true,
  },
});
