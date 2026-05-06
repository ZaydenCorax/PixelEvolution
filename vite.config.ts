import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: '/PixelEvolution/',
  server: {
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
