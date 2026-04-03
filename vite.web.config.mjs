import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Point the root directly to where the index.html lives
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  build: {
    // Outputs the web build to a clear 'dist-web' folder at the root
    outDir: '../../dist-web',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
