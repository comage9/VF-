import { defineConfig } from '@playwright/test';

// 화면 실측 전용 config — 시스템 Chrome 대신 번들 Chromium(headless) 사용
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1440, height: 900 },
    headless: true,
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: '/home/comage/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
