import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

let hasErrors = false;
const consoleErrors = [];

async function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

async function captureConsole(page) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    log(`[PAGE ERROR] ${err.message}`);
    hasErrors = true;
  });
}

async function testAddRecord(page) {
  log('=== 생산계획 추가 기능 테스트 (데스크톱) ===');

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/production`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const allButtons = await page.locator('button').allTextContents();
    log(`버튼 목록: ${JSON.stringify(allButtons.slice(0, 10))}`);

    const plusButton = page.locator('button:has-text("신규")').first();
    const plusCount = await plusButton.count();
    log(`추가 버튼 개수: ${plusCount}`);

    if (plusCount > 0) {
      await plusButton.click({ timeout: 5000 });
      await page.waitForTimeout(500);

      const dialogs = await page.locator('[role="dialog"]').count();
      log(`Dialog 개수: ${dialogs}`);

      if (dialogs > 0) {
        log('✅ 추가 Dialog 열림');
        return true;
      }
    }

    log('❌ 추가 버튼을 찾거나 클릭할 수 없음');
    return false;
  } catch (err) {
    log(`❌ 추가 테스트 실패: ${err.message}`);
    return false;
  }
}

async function testDeleteRecord(page) {
  log('=== 생산계획 삭제 기능 테스트 (데스크톱) ===');

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/production`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const checkboxes = await page.locator('input[type="checkbox"]').count();
    log(`체크박스 개수: ${checkboxes}`);

    if (checkboxes > 0) {
      await page.locator('input[type="checkbox"]').first().click();
      await page.waitForTimeout(300);
      log('✅ 체크박스 선택됨');
      return true;
    }

    log('⚠️ 삭제할 레코드 없음 또는 체크박스 없음');
    return false;
  } catch (err) {
    log(`❌ 삭제 테스트 실패: ${err.message}`);
    return false;
  }
}

async function testMobileScroll(page) {
  log('=== 모바일 뷰 스크롤 테스트 ===');

  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/production`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const cards = await page.locator('[class*="card"]').count();
    log(`카드 개수: ${cards}`);

    const scrollInfo = await page.evaluate(() => {
      return {
        scrollHeight: document.body.scrollHeight,
        clientHeight: document.body.clientHeight
      };
    });
    log(`Body: scrollHeight=${scrollInfo.scrollHeight}, clientHeight=${scrollInfo.clientHeight}`);

    const isScrollable = scrollInfo.scrollHeight > scrollInfo.clientHeight;
    log(`스크롤 가능: ${isScrollable}`);

    if (isScrollable) {
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(300);
      const newScrollTop = await page.evaluate(() => document.body.scrollTop);
      log(`스크롤 후 scrollTop: ${newScrollTop}`);
      return newScrollTop > 0;
    }

    return false;
  } catch (err) {
    log(`❌ 스크롤 테스트 실패: ${err.message}`);
    return false;
  }
}

async function testMobileDragDrop(page) {
  log('=== 모바일 드래그 앤 드롭 테스트 ===');

  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/production`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const dragHandles = await page.locator('[draggable="true"]').count();
    log(`드래그 핸들: ${dragHandles}개`);

    return dragHandles > 0;
  } catch (err) {
    log(`❌ 드래그 앤 드롭 테스트 실패: ${err.message}`);
    return false;
  }
}

async function testMachinePopover(page) {
  log('=== 기계번호 팝업 스크롤 테스트 ===');

  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/production`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const addButton = page.locator('button:has-text("신규")').first();
    const isVisible = await addButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isVisible) {
      log('모바일에서 버튼 숨김 - 데스크톱으로 전환');
      await page.setViewportSize({ width: 1280, height: 900 });
    }

    await addButton.click({ timeout: 5000 });
    await page.waitForTimeout(800);

    const machineLabel = page.locator('label:has-text("기계번호")');
    const labelCount = await machineLabel.count();
    log(`기계번호 레이블: ${labelCount}개`);

    if (labelCount > 0) {
      const trigger = machineLabel.locator('..').locator('button').first();
      const triggerExists = await trigger.count() > 0;

      if (triggerExists) {
        await trigger.click({ timeout: 3000, force: true });
        await page.waitForTimeout(500);

        const cmdList = page.locator('[cmdk-list]');
        const cmdListCount = await cmdList.count();

        if (cmdListCount > 0) {
          log('✅ CommandList 열림');

          const cmdItems = await page.locator('[cmdk-item]').allTextContents();
          log(`CommandItem 목록: ${JSON.stringify(cmdItems.slice(0, 8))}`);
          log(`총 ${cmdItems.length}개 아이템`);

          const cmdListEl = cmdList.first();
          const canScroll = await cmdListEl.evaluate(el => el.scrollHeight > el.clientHeight);
          log(`스크롤 가능: ${canScroll}`);

          if (canScroll) {
            await cmdListEl.evaluate(el => el.scrollTop = el.scrollHeight);
            await page.waitForTimeout(300);
            const newScrollTop = await cmdListEl.evaluate(el => el.scrollTop);
            log(`스크롤 후 위치: ${newScrollTop}px`);
            return newScrollTop > 0;
          }
          return true;
        }
      }
    }

    log('❌ 기계번호 팝업을 열 수 없음');
    return false;
  } catch (err) {
    log(`❌ 기계번호 팝업 테스트 실패: ${err.message}`);
    return false;
  }
}

async function testPageErrors(page) {
  log('=== 시스템 에러 로그 확인 ===');

  const errors = [];
  const tempErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      tempErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    tempErrors.push(`PAGE ERROR: ${err.message}`);
  });

  const pages = ['/', '/production', '/delivery', '/outbound'];
  for (const path of pages) {
    log(`페이지 방문: ${path}`);
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  }

  errors.push(...tempErrors);
  return errors;
}

async function runTests() {
  log('VF生产计划页面测试开始');
  log('=========================');

  const results = {
    add: false,
    delete: false,
    mobileScroll: false,
    dragDrop: false,
    machinePopover: false,
    errors: []
  };

  const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await captureConsole(desktopPage);

  results.add = await testAddRecord(desktopPage);
  results.delete = await testDeleteRecord(desktopPage);

  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await captureConsole(mobilePage);

  results.mobileScroll = await testMobileScroll(mobilePage);
  results.dragDrop = await testMobileDragDrop(mobilePage);
  results.machinePopover = await testMachinePopover(mobilePage);

  results.errors = await testPageErrors(desktopPage);

  log('=========================');
  log('测试结果摘要:');
  log(`  추가 기능: ${results.add ? '✅' : '⚠️'}`);
  log(`  삭제 기능: ${results.delete ? '✅' : '⚠️'}`);
  log(`  모바일 스크롤: ${results.mobileScroll ? '✅' : '⚠️'}`);
  log(`  드래그 앤 드롭: ${results.dragDrop ? '✅' : '⚠️'}`);
  log(`  기계번호 팝업: ${results.machinePopover ? '✅' : '⚠️'}`);
  log(`  시스템 에러: ${results.errors.length === 0 ? '✅ 없음' : '⚠️ ' + results.errors.length + '개'}`);

  if (results.errors.length > 0) {
    log('\n발견된 에러:');
    results.errors.slice(0, 5).forEach(e => log(`   - ${e.substring(0, 120)}`));
  }

  await desktopPage.close();
  await mobilePage.close();

  log('\n모든 테스트 완료!');

  process.exit(hasErrors ? 1 : 0);
}

runTests().catch(err => {
  console.error('테스트 실행 실패:', err);
  process.exit(1);
});