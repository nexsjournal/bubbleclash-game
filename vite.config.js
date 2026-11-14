import { defineConfig } from 'vite';

export default defineConfig({
  // relative URLs so the same build works at a domain root or nested paths
  // (Pogglo mounts games at /play/<slug>/)
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});
