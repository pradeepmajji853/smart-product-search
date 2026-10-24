import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = `http://localhost:${process.env.PORT || 4000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': apiTarget },
  },
  preview: {
    port: 4173,
    proxy: { '/api': apiTarget },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: false,
  },
});
