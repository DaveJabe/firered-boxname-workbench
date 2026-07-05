import { defineConfig } from 'vite';

// Relative base so a production build can be opened locally without a server.
export default defineConfig({
  base: './',
  server: {
    // Dev server accepts local connections only. The app's own only outbound
    // request is the explicit, user-triggered E-Sh4rk GitHub fetch — see
    // src/data/esharkRemote.ts — never anything automatic.
    host: '127.0.0.1',
    port: 5175,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
