import { defineConfig } from 'vite';

// Relative base so a production build can be opened locally without a server.
export default defineConfig({
  base: './',
  server: {
    // Bind to localhost only; this app makes no outbound requests.
    host: '127.0.0.1',
    port: 5175,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
