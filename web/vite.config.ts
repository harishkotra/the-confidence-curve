import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 5173 / 3001 are the intended ports. Both are overridable because this
 * machine runs several projects at once and they collide:
 *
 *   PORT=5273 API_PORT=3201 pnpm dev
 *
 * The proxy target follows API_PORT, so the web app always reaches its own
 * API rather than whatever else happens to hold the default port.
 */
const webPort = Number(process.env.PORT ?? 5173);
const apiPort = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});