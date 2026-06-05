/**
 * VF Outbound 페이지 Playwright 테스트
 *
 * 이 테스트는 다음을 확인합니다:
 * 1. Outbound 페이지 접속
 * 2. 콘솔 에러 캡처 (특히 ERR_CONNECTION_REFUSED)
 * 3. 네트워크 요청 분석 (localhost:3001 요청 실패 원인)
 * 4. 동기화 버튼 클릭 테스트
 */

import { test, expect, chromium } from '@playwright/test';

// 시스템 Chrome 사용 설정
test.use({
  launchOptions: {
    channel: 'chrome', // 시스템 Chrome 사용
    headless: true,
  },
});

test.describe('VF Outbound 페이지 테스트', () => {
  const PAGE_URL = 'http://localhost:5174/outbound?tab=vf-outbound';

  test.beforeEach(async ({ page }) => {
    // 콘솔 에러 수집
    const consoleErrors: any[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
        });
      }
    });

    // 콘솔 에러를 테스트 컨텍스트에 저장
    (page as any).consoleErrors = consoleErrors;
  });

  test('페이지 접속 및 기본 기능 확인', async ({ page }) => {
    console.log('=== 페이지 접속 시작 ===');
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // 페이지 제목 확인
    const title = await page.title();
    console.log('페이지 제목:', title);

    // 스크린샷 찍기
    await page.screenshot({ path: 'test-results/vf-outbound-page.png' });

    // 콘솔 에러 확인
    const consoleErrors = (page as any).consoleErrors || [];
    if (consoleErrors.length > 0) {
      console.log('=== 콘솔 에러 발견 ===');
      consoleErrors.forEach((err: any, index: number) => {
        console.log(`에러 ${index + 1}:`);
        console.log('  타입:', err.type);
        console.log('  메시지:', err.text);
        console.log('  위치:', err.location);
      });
    } else {
      console.log('콘솔 에러 없음');
    }

    // 페이지 로드 성공 확인
    await expect(page.locator('body')).toBeVisible();
  });

  test('동기화 버튼 클릭 테스트', async ({ page }) => {
    console.log('=== 동기화 버튼 테스트 시작 ===');
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // 동기화/새로고침 버튼 찾기
    const refreshButton = page.locator('button:has-text("새로고침"), button.refresh-button');

    // 버튼이 있는지 확인
    const buttonExists = await refreshButton.count();
    console.log('새로고침 버튼 개수:', buttonExists);

    if (buttonExists > 0) {
      // 네트워크 요청 모니터링
      const networkRequests: any[] = [];
      page.on('request', (request) => {
        networkRequests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
        });
      });

      const networkResponses: any[] = [];
      page.on('response', (response) => {
        networkResponses.push({
          url: response.url(),
          status: response.status(),
          ok: response.ok(),
        });
      });

      // 버튼 클릭
      console.log('새로고침 버튼 클릭');
      await refreshButton.click();

      // 네트워크 요청 대기
      await page.waitForTimeout(3000);

      // 네트워크 요청 분석
      console.log('=== 네트워크 요청 분석 ===');
      console.log('총 요청 수:', networkRequests.length);
      console.log('총 응답 수:', networkResponses.length);

      // localhost:3001 요청 확인
      const proxyRequests = networkRequests.filter(req =>
        req.url.includes('localhost:3001')
      );
      console.log('localhost:3001 요청 수:', proxyRequests.length);
      proxyRequests.forEach((req, index) => {
        console.log(`요청 ${index + 1}:`);
        console.log('  URL:', req.url);
        console.log('  메서드:', req.method);
        console.log('  리소스 타입:', req.resourceType);
      });

      // 실패한 응답 확인
      const failedResponses = networkResponses.filter(res => !res.ok);
      console.log('실패한 응답 수:', failedResponses.length);
      failedResponses.forEach((res, index) => {
        console.log(`실패 응답 ${index + 1}:`);
        console.log('  URL:', res.url);
        console.log('  상태:', res.status);
      });

      // 스크린샷 찍기
      await page.screenshot({ path: 'test-results/vf-outbound-after-sync.png' });
    } else {
      console.log('새로고침 버튼을 찾을 수 없습니다.');
      await page.screenshot({ path: 'test-results/vf-outbound-no-button.png' });
    }
  });

  test('Google Sheets 관련 네트워크 요청 분석', async ({ page }) => {
    console.log('=== Google Sheets 네트워크 요청 분석 시작 ===');

    const googleSheetsRequests: any[] = [];
    const googleSheetsResponses: any[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('google') || url.includes('3001')) {
        googleSheetsRequests.push({
          url,
          method: request.method(),
          headers: request.headers(),
        });
      }
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('google') || url.includes('3001')) {
        googleSheetsResponses.push({
          url,
          status: response.status(),
          ok: response.ok(),
        });
      }
    });

    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Google Sheets 관련 요청 분석
    console.log('=== Google Sheets 요청 ===');
    console.log('총 요청 수:', googleSheetsRequests.length);
    googleSheetsRequests.forEach((req, index) => {
      console.log(`요청 ${index + 1}:`);
      console.log('  URL:', req.url);
      console.log('  메서드:', req.method);
      console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    });

    console.log('=== Google Sheets 응답 ===');
    console.log('총 응답 수:', googleSheetsResponses.length);
    googleSheetsResponses.forEach((res, index) => {
      console.log(`응답 ${index + 1}:`);
      console.log('  URL:', res.url);
      console.log('  상태:', res.status);
      console.log('  성공:', res.ok);
    });

    // 콘솔 에러 분석
    const consoleErrors = (page as any).consoleErrors || [];
    const connectionErrors = consoleErrors.filter((err: any) =>
      err.text.includes('ERR_CONNECTION_REFUSED') ||
      err.text.includes('3001') ||
      err.text.includes('localhost')
    );

    console.log('=== 연결 관련 에러 ===');
    console.log('총 에러 수:', consoleErrors.length);
    console.log('연결 에러 수:', connectionErrors.length);
    connectionErrors.forEach((err: any, index: number) => {
      console.log(`연결 에러 ${index + 1}:`);
      console.log('  메시지:', err.text);
      console.log('  위치:', err.location);
    });

    await page.screenshot({ path: 'test-results/vf-outbound-network-analysis.png' });
  });

  test('DOM 구조 및 UI 요소 확인', async ({ page }) => {
    console.log('=== DOM 구조 분석 시작 ===');
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // 페이지 본문 확인
    const bodyContent = await page.content();
    console.log('페이지 길이:', bodyContent.length);

    // Outbound 관련 요소 확인
    const outboundContainer = page.locator('.outbound-tabs');
    const hasOutboundContainer = await outboundContainer.count();
    console.log('outbound-tabs 컨테이너 존재 여부:', hasOutboundContainer > 0);

    if (hasOutboundContainer > 0) {
      // 제목 확인
      const title = await outboundContainer.locator('.outbound-title').textContent();
      console.log('제목:', title);

      // 설정 상태 확인
      const statusIndicator = await outboundContainer.locator('.status-indicator').textContent();
      console.log('상태:', statusIndicator);

      // 에러 메시지 확인
      const errorMessage = await outboundContainer.locator('.error-message').count();
      console.log('에러 메시지 존재 여부:', errorMessage > 0);

      if (errorMessage > 0) {
        const errorText = await outboundContainer.locator('.error-message').textContent();
        console.log('에러 내용:', errorText);
      }

      // 데이터 테이블 확인
      const dataTable = await outboundContainer.locator('.outbound-table').count();
      console.log('데이터 테이블 존재 여부:', dataTable > 0);

      // 로딩 상태 확인
      const loadingContainer = await outboundContainer.locator('.loading-container').count();
      console.log('로딩 상태:', loadingContainer > 0);
    }

    // 스크린샷 찍기
    await page.screenshot({ path: 'test-results/vf-outbound-dom-analysis.png' });
  });
});

test.describe('VF Outbound 페이지 - 상세 분석', () => {
  const PAGE_URL = 'http://localhost:5174/outbound?tab=vf-outbound';

  test('전체 시나리오 테스트', async ({ page }) => {
    console.log('=== 전체 시나리오 테스트 시작 ===');

    // 콘솔 및 네트워크 로깅
    const logs: any = {
      console: [],
      network: { requests: [], responses: [] },
    };

    page.on('console', (msg) => {
      logs.console.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    });

    page.on('request', (request) => {
      logs.network.requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });

    page.on('response', (response) => {
      logs.network.responses.push({
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
      });
    });

    // 1. 페이지 접속
    console.log('1. 페이지 접속...');
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    console.log('   페이지 접속 완료');

    await page.screenshot({ path: 'test-results/vf-outbound-full-scenario-1.png' });

    // 2. 초기 상태 확인
    console.log('2. 초기 상태 확인...');
    const hasOutboundContainer = await page.locator('.outbound-tabs').count();
    console.log('   Outbound 컨테이너:', hasOutboundContainer > 0 ? '존재' : '없음');

    if (hasOutboundContainer > 0) {
      const status = await page.locator('.status-indicator').textContent();
      const hasError = await page.locator('.error-message').count();
      console.log('   상태:', status);
      console.log('   에러:', hasError > 0 ? '있음' : '없음');

      if (hasError > 0) {
        const errorText = await page.locator('.error-message').textContent();
        console.log('   에러 내용:', errorText);
      }
    }

    // 3. 새로고침 버튼 클릭
    console.log('3. 새로고침 버튼 클릭...');
    const refreshButton = page.locator('button:has-text("새로고침"), button.refresh-button');
    const buttonExists = await refreshButton.count();

    if (buttonExists > 0) {
      await refreshButton.click();
      await page.waitForTimeout(3000);
      console.log('   버튼 클릭 완료');
      await page.screenshot({ path: 'test-results/vf-outbound-full-scenario-2.png' });
    } else {
      console.log('   버튼 없음');
    }

    // 4. 최종 상태 확인
    console.log('4. 최종 상태 확인...');
    const finalHasError = await page.locator('.error-message').count();
    const finalHasTable = await page.locator('.outbound-table').count();
    console.log('   최종 에러:', finalHasError > 0 ? '있음' : '없음');
    console.log('   데이터 테이블:', finalHasTable > 0 ? '있음' : '없음');

    await page.screenshot({ path: 'test-results/vf-outbound-full-scenario-final.png' });

    // 5. 로그 분석 및 보고
    console.log('\n=== 로그 분석 결과 ===');

    // 콘솔 에러
    const consoleErrors = logs.console.filter((log: any) => log.type === 'error');
    console.log('콘솔 에러 수:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('콘솔 에러:');
      consoleErrors.forEach((err: any, i: number) => {
        console.error(`  ${i + 1}. ${err.text}`);
        console.error(`     위치: ${err.location?.url}:${err.location?.lineNumber}`);
      });
    }

    // 네트워크 요청
    console.log('총 네트워크 요청:', logs.network.requests.length);
    const proxyRequests = logs.network.requests.filter((req: any) =>
      req.url.includes('3001')
    );
    console.log('localhost:3001 요청:', proxyRequests.length);

    // 네트워크 응답
    console.log('총 네트워크 응답:', logs.network.responses.length);
    const failedResponses = logs.network.responses.filter((res: any) => !res.ok);
    console.log('실패한 응답:', failedResponses.length);

    if (failedResponses.length > 0) {
      console.error('실패한 응답:');
      failedResponses.forEach((res: any, i: number) => {
        console.error(`  ${i + 1}. ${res.url} - ${res.status}`);
      });
    }

    // 로그 저장
    const fs = require('fs');
    fs.writeFileSync('test-results/vf-outbound-analysis.json', JSON.stringify(logs, null, 2));
    console.log('\n분석 결과가 test-results/vf-outbound-analysis.json에 저장되었습니다.');
  });
});
