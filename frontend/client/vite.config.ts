import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          recharts: ['recharts']
        }
      }
    }
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    // 허용할 호스트 주소 추가
    allowedHosts: ['bonohouse.p-e.kr'],
    proxy: {
      '/api': {
        target: 'http://localhost:5176',
        changeOrigin: true,
      },
      '/departure/api': {
        target: 'http://localhost:5176',
        changeOrigin: true,
      },
      '/truck-freight/api': {
        target: 'http://localhost:5176',
        changeOrigin: true,
      },
    },
  },
});