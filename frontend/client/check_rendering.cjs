const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1200 }
  });
  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => {
    console.log('PAGE ERROR (Crash Trace):', err.message);
    if (err.stack) console.log(err.stack);
  });
  
  console.log('대시보드 페이지 이동 중: http://localhost:5174');
  
  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('네비게이션 완료. 3초 대기...');
    await page.waitForTimeout(3000);
    
    console.log('왼쪽 메뉴의 "출고 수량" 탭 클릭 시도...');
    await page.click('text=출고 수량');
    console.log('"출고 수량" 대시보드 로딩 및 비동기 통신을 위해 5초 대기...');
    await page.waitForTimeout(5000);
    
    const pageTitle = await page.title();
    console.log(`페이지 타이틀: ${pageTitle}`);
    
    // 에러 관련 텍스트 확인
    const contentText = await page.innerText('body');
    if (contentText.includes('오류') || contentText.includes('failed') || contentText.includes('크래시') || contentText.includes('Cannot find')) {
      console.log('⚠️ 경고: 화면에 오류 또는 실패 관련 키워드가 검출되었습니다.');
    }
    
    // 주요 UI 엘리먼트 존재 여부 검사
    const hasTrendChart = (await page.locator('text=매출 및 출고량 추이').count() > 0) || (await page.locator('text=추이').count() > 0);
    const hasPivotTable = await page.locator('text=통합 기간 합계 테이블').count() > 0;
    const hasAutoBadge = await page.locator('text=자동').count() > 0;
    const hasSearchInput = await page.locator('input[placeholder*="초성"]').count() > 0 || await page.locator('input[placeholder*="품목명"]').count() > 0;
    
    console.log(`[검증 결과]`);
    console.log(`- 트렌드 차트 존재 여부: ${hasTrendChart ? '확인됨' : '없음'}`);
    console.log(`- 통합 기간 합계 테이블 존재 여부: ${hasPivotTable ? '확인됨' : '없음'}`);
    console.log(`- Segmented [자동] 탭 버튼 존재 여부: ${hasAutoBadge ? '확인됨' : '없음'}`);
    console.log(`- 상세 품목 검색바 존재 여부: ${hasSearchInput ? '확인됨' : '없음'}`);
    
    // 스크린샷 캡처 및 저장
    const screenshotPath = '/home/comtop/.gemini/antigravity-cli/brain/7b3a776a-75d9-4252-a181-c98e34d88547/dashboard_capture.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 스크린샷이 성공적으로 저장되었습니다: ${screenshotPath}`);
    
  } catch (err) {
    console.error('❌ 플레이라이트 실행 중 에러 발생:', err);
  } finally {
    await browser.close();
  }
})();
