const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('=== VF Outbound 테스트 시작 ===');
  console.log('시간:', new Date().toLocaleString('ko-KR'));

  // 로그 수집용 변수
  const consoleLogs = [];
  const errors = [];
  const warnings = [];
  const networkRequests = [];
  const networkResponses = [];

  let browser;
  let page;

  try {
    // 브라우저 시작 (headless 모드)
    console.log('\n=== 브라우저 시작 ===');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext();
    page = await context.newPage();

    // 콘솔 로그 리스너
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);

      if (msg.type() === 'error') {
        errors.push(text);
        console.log('ERROR:', text);
      } else if (msg.type() === 'warning') {
        warnings.push(text);
      }
    });

    // 네트워크 리스너
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });

      // 중요 요청 로깅
      if (request.url().includes('sheets.googleapis.com') ||
          request.url().includes('googleapis.com') ||
          request.url().includes('localhost:5176')) {
        console.log(`REQUEST: ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', response => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers()
      });

      // 중요 응답 로깅
      if (response.url().includes('sheets.googleapis.com') ||
          response.url().includes('googleapis.com') ||
          response.url().includes('localhost:5176')) {
        console.log(`RESPONSE: ${response.status()} ${response.statusText()} - ${response.url()}`);

        if (response.status() >= 400) {
          console.log(`  ERROR: ${response.status()} ${response.statusText()}`);
        }
      }
    });

    // 1. 페이지 접속
    console.log('\n=== 페이지 접속 ===');
    const url = 'http://localhost:5174/outbound?tab=vf-outbound';
    console.log('URL:', url);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('=== 페이지 로드 완료 ===');
    console.log('페이지 URL:', page.url());
    console.log('페이지 제목:', await page.title());

    // 스크린샷 촬영
    const screenshotsDir = 'test-screenshots';
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    await page.screenshot({ path: `${screenshotsDir}/vf-outbound-initial.png` });
    console.log('=== 초기 스크린샷 저장 완료 ===');

    // 2. 동기화 버튼 찾기
    console.log('\n=== 동기화 버튼 찾기 ===');

    // 다양한 방법으로 동기화 버튼 찾기
    let syncButton = null;
    const buttonSelectors = [
      'text=동기화',
      'button:has-text("동기화")',
      '[data-testid="sync-button"]',
      '.sync-button',
      'button.sync'
    ];

    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { state: 'visible', timeout: 2000 });
        syncButton = page.locator(selector).first();
        console.log(`동기화 버튼 발견: ${selector}`);
        break;
      } catch (error) {
        console.log(`선택자 실패: ${selector}`);
      }
    }

    if (!syncButton) {
      // 수동으로 버튼 검색
      console.log('=== 버튼 수동 검색 ===');
      const buttons = await page.locator('button').all();
      console.log(`발견된 버튼 수: ${buttons.length}`);

      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        try {
          const button = buttons[i];
          const text = await button.textContent();
          const buttonText = text?.trim() || '';
          console.log(`버튼 ${i + 1}: "${buttonText}"`);

          if (buttonText.includes('동기화') || buttonText.includes('sync')) {
            syncButton = button;
            console.log(`동기화 버튼 발견: "${buttonText}"`);
            break;
          }
        } catch (error) {
          // 버튼 텍스트를 읽을 수 없는 경우 무시
        }
      }
    }

    if (!syncButton) {
      throw new Error('동기화 버튼을 찾을 수 없습니다');
    }

    // 3. 동기화 버튼 클릭
    console.log('\n=== 동기화 버튼 클릭 ===');
    await syncButton.click();
    console.log('동기화 버튼 클릭 완료');

    // 4. 동기화 완료 대기
    console.log('\n=== 동기화 완료 대기 ===');
    await page.waitForTimeout(5000);

    // 스크린샷 촬영
    await page.screenshot({ path: `${screenshotsDir}/vf-outbound-after-sync.png` });
    console.log('=== 동기화 후 스크린샷 저장 완료 ===');

    // 5. 페이지 데이터 확인
    console.log('\n=== 페이지 데이터 확인 ===');
    const tables = await page.locator('table').all();
    console.log(`발견된 테이블 수: ${tables.length}`);

    const dataRows = await page.locator('tr').all();
    console.log(`발견된 데이터 행 수: ${dataRows.length}`);

    // 6. 로그 분석
    console.log('\n=== 로그 분석 ===');
    console.log(`총 콘솔 로그 수: ${consoleLogs.length}`);
    console.log(`에러 수: ${errors.length}`);
    console.log(`경고 수: ${warnings.length}`);

    // Google Sheets 관련 요청 분석
    const googleSheetsRequests = networkRequests.filter(req =>
      req.url.includes('sheets.googleapis.com') ||
      req.url.includes('googleapis.com') ||
      (req.url.includes('localhost:5176') && req.url.includes('outbound'))
    );

    const googleSheetsResponses = networkResponses.filter(res =>
      res.url.includes('sheets.googleapis.com') ||
      res.url.includes('googleapis.com') ||
      (res.url.includes('localhost:5176') && res.url.includes('outbound'))
    );

    const googleSheetsErrors = googleSheetsResponses.filter(res => res.status >= 400);

    console.log(`\nGoogle Sheets 관련 요청: ${googleSheetsRequests.length}개`);
    console.log(`Google Sheets 관련 응답: ${googleSheetsResponses.length}개`);
    console.log(`Google Sheets 에러: ${googleSheetsErrors.length}개`);

    // 7. 로그 파일 저장
    const logsDir = 'test-logs';
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFilePath = path.join(logsDir, `vf-outbound-test-${timestamp}.log`);

    const logContent = `
VF Outbound 테스트 로그
===================
테스트 시간: ${new Date().toLocaleString('ko-KR')}
페이지 URL: ${url}

=== 콘솔 로그 (총 ${consoleLogs.length}개) ===
${consoleLogs.join('\n')}

=== 에러 로그 (총 ${errors.length}개) ===
${errors.map(e => `ERROR: ${e}`).join('\n')}

=== 경고 로그 (총 ${warnings.length}개) ===
${warnings.map(w => `WARNING: ${w}`).join('\n')}

=== 네트워크 요청 (총 ${networkRequests.length}개) ===
${networkRequests.map(req => `${req.method} ${req.url}`).join('\n')}

=== 네트워크 응답 (총 ${networkResponses.length}개) ===
${networkResponses.map(res => `${res.status} ${res.statusText} - ${res.url}`).join('\n')}

=== Google Sheets 관련 요청/응답 ===
${googleSheetsRequests.map(req => `요청: ${req.method} ${req.url}`).join('\n')}
${googleSheetsResponses.map(res => `응답: ${res.status} ${res.statusText} - ${res.url}`).join('\n')}
`;

    fs.writeFileSync(logFilePath, logContent);
    console.log(`\n=== 로그 파일 저장 완료: ${logFilePath} ===`);

    // 8. 결과 저장
    const testResults = {
      timestamp: new Date().toLocaleString('ko-KR'),
      pageUrl: url,
      success: errors.length === 0 && googleSheetsErrors.length === 0,
      consoleErrors: errors,
      consoleWarnings: warnings,
      networkRequests: {
        total: networkRequests.length,
        googleSheetsRelated: googleSheetsRequests.length
      },
      networkResponses: {
        total: networkResponses.length,
        googleSheetsRelated: googleSheetsResponses.length,
        errors: googleSheetsErrors.length,
        errorDetails: googleSheetsErrors.map(err => ({
          url: err.url,
          status: err.status,
          statusText: err.statusText
        }))
      },
      pageData: {
        tables: tables.length,
        dataRows: dataRows.length
      },
      logFilePath: logFilePath
    };

    const resultsFilePath = path.join(logsDir, `vf-outbound-results-${timestamp}.json`);
    fs.writeFileSync(resultsFilePath, JSON.stringify(testResults, null, 2));
    console.log(`=== 결과 파일 저장 완료: ${resultsFilePath} ===`);

    // 9. 테스트 결과 판단
    console.log('\n=== 테스트 결과 판단 ===');

    if (errors.length > 0) {
      console.log('❌ 테스트 실패: 콘솔 에러 발생');
      console.log('에러 메시지:', errors[0]);
    } else {
      console.log('✅ 콘솔 에러 없음');
    }

    if (googleSheetsRequests.length > 0) {
      console.log('✅ Google Sheets API 요청 감지됨');
    } else {
      console.log('⚠️  Google Sheets API 요청 감지되지 않음');
    }

    if (googleSheetsErrors.length > 0) {
      console.log('❌ Google Sheets API 에러 발생');
      googleSheetsErrors.forEach(err => {
        console.log(`  에러: ${err.status} ${err.statusText} - ${err.url}`);
      });
    } else {
      console.log('✅ Google Sheets API 에러 없음');
    }

    console.log('\n=== 테스트 완료 ===');

  } catch (error) {
    console.error('\n=== 테스트 실패 ===');
    console.error('에러:', error.message);
    console.error('스택:', error.stack);

    // 에러 발생 시에도 결과 저장
    const logsDir = 'test-logs';
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const errorResults = {
      timestamp: new Date().toLocaleString('ko-KR'),
      success: false,
      error: {
        message: error.message,
        stack: error.stack
      },
      consoleErrors: errors,
      consoleWarnings: warnings,
      networkRequests: networkRequests.length,
      networkResponses: networkResponses.length
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorResultsPath = path.join(logsDir, `vf-outbound-error-${timestamp}.json`);
    fs.writeFileSync(errorResultsPath, JSON.stringify(errorResults, null, 2));

    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('=== 브라우저 종료 ===');
    }
  }
}

// 테스트 실행
runTest().catch(error => {
  console.error('치명적 오류:', error);
  process.exit(1);
});