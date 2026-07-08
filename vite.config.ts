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
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Monaco is ~4 MB of JS: keep it in its own cached chunk, split vendor code
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react';
        },
      },
    },
    chunkSizeWarningLimit: 4500,
  },
});
