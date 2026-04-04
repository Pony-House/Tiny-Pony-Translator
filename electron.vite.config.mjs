import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Ignore node_modules and build folders to save CPU/IO
  ignored: ['**/node_modules/**', '**/dist/**'],
  main: {},
  preload: {},
  renderer: {
    publicDir: resolve('public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
