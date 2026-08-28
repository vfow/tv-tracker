import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/vue/',
  plugins: [vue()],
  build: {
    outDir: 'static/vue',
    emptyOutDir: true,
    manifest: 'manifest.json',
    sourcemap: false,
    rollupOptions: {
      input: 'frontend/src/main.ts',
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
