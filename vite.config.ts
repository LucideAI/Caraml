import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPortRaw = process.env.CARAML_API_PORT || '3001';
const parsedApiPort = Number.parseInt(apiPortRaw, 10);
const apiPort = Number.isFinite(parsedApiPort) && parsedApiPort > 0 ? parsedApiPort : 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
