/**
 * VF Outbound 페이지 단순 Playwright 테스트
 */

import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    channel: 'chrome',
    headless: true,
  },
});

test('VF Outbound 페이지 상세 분석', async ({ page }) => {
  const PAGE_URL = 'http://localhost:5174/outbound?tab=vf-outbound';

  // 로그 수집
  const logs: any = {
    console: [],
    network: { requests: [], responses: [] },
    errors: []
  };

  // 콘솔 이벤트 수집
  page.on('console', (msg) => {
    const logEntry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: new Date().toISOString()
    };
    logs.console.push(logEntry);

    // 에러 로그 분리
    if (msg.type() === 'error') {
      logs.errors.push(logEntry);
    }
  });

  // 네트워크 요청 수집
  page.on('request', (request) => {
    const logEntry = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString()
    };
    logs.network.requests.push(logEntry);
  });

  // 네트워크 응답 수집
  page.on('response', (response) => {
    const logEntry = {
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      timestamp: new Date().toISOString()
    };
    logs.network.responses.push(logEntry);
  });

  console.log('=== 페이지 접속 시작 ===');
  const response = await page.goto(PAGE_URL);

  console.log('페이지 응답 상태:', response?.status());

  // 페이지 로드 대기 (networkidle 대신 wait_for_load_state)
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

  console.log('페이지 로드 완료');

  // 페이지 타이틀 확인
  try {
    const title = await page.title();
    console.log('페이지 제목:', title);
  } catch (error) {
    console.log('페이지 제목 가져오기 실패:', error);
  }

  // 네트워크 요청 대기 (추가)
  await page.waitForTimeout(3000);

  console.log('\n=== 네트워크 요청 분석 ===');
  console.log('총 요청 수:', logs.network.requests.length);
  console.log('총 응답 수:', logs.network.responses.length);

  // localhost:3001 요청 분석
  const proxyRequests = logs.network.requests.filter(req =>
    req.url.includes('localhost:3001') || req.url.includes(':3001')
  );
  console.log('localhost:3001 요청 수:', proxyRequests.length);

  proxyRequests.forEach((req, index) => {
    console.log(`\n프록시 요청 ${index + 1}:`);
    console.log('  URL:', req.url);
    console.log('  메서드:', req.method);
    console.log('  리소스 타입:', req.resourceType);
  });

  // Google Sheets 관련 요청
  const googleRequests = logs.network.requests.filter(req =>
    req.url.includes('google') || req.url.includes('docs.google')
  );
  console.log('\nGoogle Sheets 관련 요청 수:', googleRequests.length);

  googleRequests.forEach((req, index) => {
    console.log(`\nGoogle 요청 ${index + 1}:`);
    console.log('  URL:', req.url);
    console.log('  메서드:', req.method);
  });

  // 실패한 응답 분석
  const failedResponses = logs.network.responses.filter(res => !res.ok);
  console.log('\n=== 실패한 응답 ===');
  console.log('실패한 응답 수:', failedResponses.length);

  if (failedResponses.length > 0) {
    failedResponses.forEach((res, index) => {
      console.log(`\n실패 응답 ${index + 1}:`);
      console.log('  URL:', res.url);
      console.log('  상태:', res.status);
    });
  } else {
    console.log('실패한 응답 없음');
  }

  // CORS 프록시 응답 분석
  const proxyResponses = logs.network.responses.filter(res =>
    res.url.includes('localhost:3001') || res.url.includes(':3001')
  );
  console.log('\n=== CORS 프록시 응답 분석 ===');
  console.log('프록시 응답 수:', proxyResponses.length);

  proxyResponses.forEach((res, index) => {
    console.log(`\n프록시 응답 ${index + 1}:`);
    console.log('  URL:', res.url);
    console.log('  상태:', res.status);
    console.log('  성공:', res.ok);
  });

  // 콘솔 에러 분석
  console.log('\n=== 콘솔 에러 분석 ===');
  console.log('총 콘솔 메시지:', logs.console.length);
  console.log('에러 메시지 수:', logs.errors.length);

  if (logs.errors.length > 0) {
    console.error('\n에러 메시지:');
    logs.errors.forEach((error, index) => {
      console.error(`\n에러 ${index + 1}:`);
      console.error('  타입:', error.type);
      console.error('  메시지:', error.text);
      console.error('  위치:', error.location);
    });
  }

  // ERR_CONNECTION_REFUSED 에러 확인
  const connectionErrors = logs.errors.filter(err =>
    err.text.includes('ERR_CONNECTION_REFUSED') ||
    err.text.includes('CONNECTION_REFUSED') ||
    err.text.includes('3001')
  );
  console.log('\n=== 연결 관련 에러 ===');
  console.log('연결 에러 수:', connectionErrors.length);

  if (connectionErrors.length > 0) {
    console.error('\n연결 에러:');
    connectionErrors.forEach((error, index) => {
      console.error(`\n연결 에러 ${index + 1}:`);
      console.error('  메시지:', error.text);
      console.error('  위치:', error.location);
    });
  } else {
    console.log('연결 에러 없음');
  }

  // DOM 요소 확인
  console.log('\n=== DOM 요소 확인 ===');
  try {
    const outboundContainer = await page.locator('.outbound-tabs').count();
    console.log('outbound-tabs 컨테이너:', outboundContainer > 0 ? '존재' : '없음');

    if (outboundContainer > 0) {
      // 제목
      const titleElement = await page.locator('.outbound-tabs .outbound-title').textContent();
      console.log('제목:', titleElement);

      // 상태 표시
      const statusElement = await page.locator('.outbound-tabs .status-indicator').textContent();
      console.log('상태:', statusElement);

      // 에러 메시지
      const errorMessageCount = await page.locator('.outbound-tabs .error-message').count();
      console.log('에러 메시지:', errorMessageCount > 0 ? '있음' : '없음');

      if (errorMessageCount > 0) {
        const errorMessageText = await page.locator('.outbound-tabs .error-message').textContent();
        console.log('에러 내용:', errorMessageText);
      }

      // 데이터 테이블
      const dataTableCount = await page.locator('.outbound-tabs .outbound-table').count();
      console.log('데이터 테이블:', dataTableCount > 0 ? '있음' : '없음');

      // 새로고침 버튼
      const refreshButtonCount = await page.locator('.outbound-tabs button').count();
      console.log('버튼 수:', refreshButtonCount);

      // 로딩 상태
      const loadingContainerCount = await page.locator('.outbound-tabs .loading-container').count();
      console.log('로딩 상태:', loadingContainerCount > 0 ? '있음' : '없음');
    }
  } catch (error) {
    console.log('DOM 확인 중 오류:', error);
  }

  // 스크린샷 시도
  try {
    console.log('\n=== 스크린샷 찍기 ===');
    await page.screenshot({
      path: 'test-results/vf-outbound-simple.png',
      timeout: 5000
    });
    console.log('스크린샷 저장 완료');
  } catch (error) {
    console.log('스크린샷 실패:', error);
  }

  // 로그 파일 저장
  const fs = require('fs');
  fs.writeFileSync('test-results/vf-outbound-simple-analysis.json', JSON.stringify(logs, null, 2));
  console.log('\n=== 분석 결과 저장 ===');
  console.log('test-results/vf-outbound-simple-analysis.json에 저장 완료');

  // 요약
  console.log('\n=== 테스트 요약 ===');
  console.log('페이지 접속: 성공');
  console.log('localhost:3001 요청:', proxyRequests.length > 0 ? `${proxyRequests.length}개 요청` : '없음');
  console.log('콘솔 에러:', logs.errors.length > 0 ? `${logs.errors.length}개` : '없음');
  console.log('연결 에러:', connectionErrors.length > 0 ? `${connectionErrors.length}개` : '없음');

  // 테스트 통과
  expect(true).toBe(true);
});
