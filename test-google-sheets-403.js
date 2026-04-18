/**
 * Google Sheets 403 에러 분석 테스트
 * Playwright를 사용하여 실제 브라우저 환경에서 테스트
 */

const { chromium } = require('playwright');

async function testGoogleSheetsAccess() {
  console.log('🔍 Google Sheets 403 에러 분석 시작...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 테스트할 URLs
  const tests = [
    {
      name: '1. Google Sheets 직접 접속',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv',
      expected: '200 OK',
      description: 'Google Sheets Published URL (CORS 문제 예상)'
    },
    {
      name: '2. CORS 프록시 접속',
      url: 'https://corsproxy.io/?' + encodeURIComponent('https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv'),
      expected: '403 Forbidden',
      description: 'CORS Proxy를 통한 접속 (403 에러 예상)'
    },
    {
      name: '3. 대체 CORS 프록시 테스트',
      url: 'https://cors-anywhere.herokuapp.com/' + 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv',
      expected: 'Unknown',
      description: '대체 CORS 프록시 테스트'
    }
  ];

  const results = [];

  for (const test of tests) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   설명: ${test.description}`);
    console.log(`   URL: ${test.url.substring(0, 80)}...`);

    try {
      // 네트워크 요청 모니터링
      const responses = [];
      page.on('response', response => {
        if (response.url().includes('google') || response.url().includes('corsproxy')) {
          responses.push({
            url: response.url(),
            status: response.status(),
            statusText: response.statusText(),
            headers: response.headers()
          });
        }
      });

      // 페이지 접속 시도
      const response = await page.goto(test.url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      const result = {
        name: test.name,
        url: test.url,
        status: response ? response.status() : 'No response',
        statusText: response ? response.statusText() : 'No response',
        success: response && response.ok(),
        networkResponses: responses,
        contentType: response ? response.headers()['content-type'] : 'Unknown',
        bodyLength: 0
      };

      // 응답 내용 확인 (가능한 경우)
      if (response && response.ok()) {
        try {
          const text = await response.text();
          result.bodyLength = text.length;
          result.bodyPreview = text.substring(0, 200);
        } catch (e) {
          result.bodyError = e.message;
        }
      }

      results.push(result);

      // 결과 출력
      console.log(`   결과: ${result.status} ${result.statusText}`);
      console.log(`   성공: ${result.success ? '✅' : '❌'}`);
      console.log(`   Content-Type: ${result.contentType}`);
      if (result.bodyLength > 0) {
        console.log(`   본문 길이: ${result.bodyLength} bytes`);
        console.log(`   미리보기: ${result.bodyPreview.substring(0, 100)}...`);
      }
      if (result.networkResponses.length > 0) {
        console.log(`   네트워크 요청: ${result.networkResponses.length}개`);
        result.networkResponses.forEach((resp, i) => {
          console.log(`     ${i+1}. ${resp.status} - ${resp.url.substring(0, 60)}...`);
        });
      }

    } catch (error) {
      console.log(`   에러: ${error.message}`);
      results.push({
        name: test.name,
        url: test.url,
        error: error.message,
        success: false
      });
    }

    // 잠시 대기
    await page.waitForTimeout(2000);
  }

  // 최종 분석
  console.log('\n\n📊 최종 분석 결과:');
  console.log('='.repeat(60));

  const directAccess = results.find(r => r.name.includes('직접'));
  const corsProxyAccess = results.find(r => r.name.includes('CORS 프록시'));

  if (directAccess && corsProxyAccess) {
    console.log(`\n1. Google Sheets 직접 접속: ${directAccess.success ? '✅ 성공' : '❌ 실패'} (${directAccess.status})`);
    console.log(`2. CORS 프록시 접속: ${corsProxyAccess.success ? '✅ 성공' : '❌ 실패'} (${corsProxyAccess.status})`);

    if (directAccess.success && !corsProxyAccess.success) {
      console.log('\n🎯 근본 원인 확인:');
      console.log('   - Google Sheets URL 자체는 정상 작동');
      console.log('   - corsproxy.io가 Google Sheets 요청을 403으로 차단');
      console.log('   - 이는 API 키나 접근 권한 문제가 아님');
      console.log('   - CORS 프록시 서비스의 제한 사항');
    }
  }

  console.log('\n\n💡 해결책 제안:');
  console.log('1. CORS 프록시 변경: 다른 CORS 프록시 서비스 사용');
  console.log('2. 자체 CORS 프록시: Node.js 서버에서 직접 프록시 구현');
  console.log('3. Google Sheets API: 공식 API와 API 키 사용');
  console.log('4. 서버사이드 렌더링: 백엔드에서 데이터 가져오기');

  await browser.close();
  console.log('\n✅ 테스트 완료');
}

// 실행
testGoogleSheetsAccess().catch(console.error);