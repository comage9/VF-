import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
// Vite 8: Rolldown bundler (rollupOptions 호환 레이어 유지)
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'VF 보노하우스 생산관리',
        short_name: 'VF 보노하우스',
        description: '실시간 생산 인사이트 대시보드',
        theme_color: '#721FE5',
        background_color: '#FAFAFA',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // precache: 빌드 결과물(HTML/JS/CSS/폰트) 자동 캐싱
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // SPA 라우팅 오프라인 새로고침 시 index.html 서빙 가이드 지정
        navigateFallback: '/index.html',
        // API 요청은 index.html 서빙에서 제외 (원래 에러로 Fallback)
        navigateFallbackDenylist: [/^\/api\/.*/, /^\/departure\/api\/.*/, /^\/truck-freight\/api\/.*/],
        // API는 온라인 우선, 실패 시 캐시 (오프라인에서 마지막 데이터 표시)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1년
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5, // 5초 내 응답 없으면 캐시 사용
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24시간
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/departure\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'departure-api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/truck-freight\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'truck-freight-api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // 개발 환경(npm run dev)에서도 PWA 서비스 워커가 동작하도록 강제 활성화
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Vite 8 / Rolldown: manualChunks 는 함수 형태만 허용
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'recharts';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) {
              return 'vendor';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    // 허용할 호스트 주소 추가 (모든 호스트 허용)
    allowedHosts: true,
    proxy: {
      // Windows에서 localhost → ::1 이슈 완화: 127.0.0.1 고정
      '/api': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      '/departure/api': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      '/truck-freight/api': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      '/media': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
});