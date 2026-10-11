import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // Relative base so the same build works on the web, inside Tauri and inside Capacitor.
  base: './',
  server: { host: true },
  build: { sourcemap: true },
});
