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
        // precache: 빌드 결과물 (스캐너 HTML 은 로직 자주 바뀌므로 제외)
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        globIgnores: ['**/barcode_scanner.html', '**/barcode_scanner*.html'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\/.*/,
          /^\/departure\/api\/.*/,
          /^\/truck-freight\/api\/.*/,
          /barcode_scanner/,
        ],
        runtimeCaching: [
          {
            // 스캐너: 항상 네트워크 (캐시하면 기간 입고가능 로직 수정이 안 보임)
            urlPattern: /barcode_scanner.*\.html/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
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
        // dev 에서 SW 켜면 public/barcode_scanner.html 등 정적 파일이 캐시되어
        // 로직 수정이 화면에 안 반영되는 문제가 반복됨 → 개발 중 비활성
        enabled: false,
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
      // Windows: 127.0.0.1 고정
      // ═══════════════════════════════════════════════════════════
      // VF-new 운영 프론트 → Django(:5176) 만 사용.
      // VF-go(:5177) 와 섞지 않음. Go 패리티는 curl/check_parity 로 별도 검증.
      // (과거 Go 시험 프록시는 혼선·ECONNREFUSED 유발 → 제거)
      // ═══════════════════════════════════════════════════════════
      '/api/master': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      // 재고 기준 스냅샷: 엑셀/ZIP 파싱·DB 교체 — 일반 API보다 여유
      '/api/inventory/baseline-upload': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
      '/api/inventory/receipts-upload': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
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