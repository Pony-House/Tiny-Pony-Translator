/** @type {import('vite').UserConfig} */
export default {
  server: {
    watch: {
      // Ignore node_modules and build folders to save CPU/IO
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
  },
};
