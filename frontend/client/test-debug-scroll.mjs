import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

async function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

async function diagnoseMobileScroll(page) {
  log('=== 모바일 스크롤 문제 진단 ===');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${BASE_URL}/production`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Get page metrics
  const metrics = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      bodyScrollTop: body.scrollTop,
      htmlScrollHeight: html.scrollHeight,
      htmlClientHeight: html.clientHeight,
      windowInnerHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      bodyStyle: {
        overflow: window.getComputedStyle(body).overflow,
        overflowY: window.getComputedStyle(body).overflowY,
        height: window.getComputedStyle(body).height,
        position: window.getComputedStyle(body).position,
      },
      rootStyle: {
        overflow: window.getComputedStyle(html).overflow,
        overflowY: window.getComputedStyle(html).overflowY,
      },
      // Check for fixed/bottom elements
      fixedElements: [...document.querySelectorAll('*')]
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.position === 'fixed' || style.position === 'sticky';
        })
        .map(el => {
          const style = window.getComputedStyle(el);
          return {
            tag: el.tagName,
            class: el.className.substring(0, 50),
            position: style.position,
            bottom: style.bottom
          };
        })
    };
  });

  log('Body metrics:');
  log(`  scrollHeight: ${metrics.bodyScrollHeight}`);
  log(`  clientHeight: ${metrics.bodyClientHeight}`);
  log(`  scrollTop: ${metrics.bodyScrollTop}`);

  log('HTML metrics:');
  log(`  scrollHeight: ${metrics.htmlScrollHeight}`);
  log(`  clientHeight: ${metrics.htmlClientHeight}`);

  log('Window innerHeight: ' + metrics.windowInnerHeight);
  log('Document scrollHeight: ' + metrics.documentHeight);

  log('Body styles:');
  log(`  overflow: ${metrics.bodyStyle.overflow}`);
  log(`  overflowY: ${metrics.bodyStyle.overflowY}`);
  log(`  height: ${metrics.bodyStyle.height}`);
  log(`  position: ${metrics.bodyStyle.position}`);

  log('HTML styles:');
  log(`  overflow: ${metrics.rootStyle.overflow}`);
  log(`  overflowY: ${metrics.rootStyle.overflowY}`);

  log('Fixed/Sticky elements:');
  metrics.fixedElements.forEach(el => {
    log(`  ${el.tag}.${el.class} - position:${el.position}, bottom:${el.bottom}`);
  });

  // Get actual card positions
  const cardCount = await page.locator('[class*="card"]').count();
  log(`Card count: ${cardCount}`);

  // Check main container
  const mainContainer = page.locator('main, #root > div, .space-y-6').first();
  const containerBox = await mainContainer.boundingBox().catch(() => null);
  if (containerBox) {
    log(`Main container: ${containerBox.width}x${containerBox.height} at (${containerBox.x}, ${containerBox.y})`);
  }

  return metrics;
}

async function testCommandListScroll(page) {
  log('=== CommandList 스크롤 진단 ===');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/production`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Click the add button to open dialog
  await page.locator('button:has-text("신규")').first().click();
  await page.waitForTimeout(500);

  // Find and click the machine number popover trigger
  const machineTrigger = page.locator('label:has-text("기계번호")').locator('..').locator('button').first();
  const triggerExists = await machineTrigger.count() > 0;

  if (triggerExists) {
    await machineTrigger.click();
    await page.waitForTimeout(500);

    // Get the CommandList element
    const cmdList = page.locator('[cmdk-list]').first();
    const cmdListCount = await cmdList.count();

    if (cmdListCount > 0) {
      log('CommandList found');

      const cmdListMetrics = await cmdList.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
          overflow: style.overflow,
          overflowY: style.overflowY,
          maxHeight: style.maxHeight,
          height: style.height,
          display: style.display,
          flexDirection: style.flexDirection
        };
      });

      log('CommandList metrics:');
      log(`  scrollHeight: ${cmdListMetrics.scrollHeight}`);
      log(`  clientHeight: ${cmdListMetrics.clientHeight}`);
      log(`  overflow: ${cmdListMetrics.overflow}`);
      log(`  overflowY: ${cmdListMetrics.overflowY}`);
      log(`  maxHeight: ${cmdListMetrics.maxHeight}`);
      log(`  height: ${cmdListMetrics.height}`);

      // Check CommandItem count
      const cmdItems = await page.locator('[cmdk-item]').count();
      log(`CommandItem count: ${cmdItems}`);

      // Check CommandRoot
      const cmdRoot = page.locator('[cmdk-root]').first();
      if (await cmdRoot.count() > 0) {
        const cmdRootMetrics = await cmdRoot.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            overflow: style.overflow,
            maxHeight: style.maxHeight,
            display: style.display,
            flexDirection: style.flexDirection
          };
        });
        log('CommandRoot styles:');
        log(`  overflow: ${cmdRootMetrics.overflow}`);
        log(`  maxHeight: ${cmdRootMetrics.maxHeight}`);
        log(`  display: ${cmdRootMetrics.display}`);
      }

      // Check parent PopoverContent
      const popoverContent = page.locator('[data-radix-popper-content-wrapper]').first();
      if (await popoverContent.count() > 0) {
        const popMetrics = await popoverContent.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            overflow: style.overflow,
            width: style.width,
            height: style.height,
          };
        });
        log('PopoverContent wrapper:');
        log(`  overflow: ${popMetrics.overflow}`);
        log(`  width: ${popMetrics.width}`);
        log(`  height: ${popMetrics.height}`);
      }
    }
  } else {
    log('Machine trigger not found');
  }
}

async function runTests() {
  const page = await browser.newPage();

  await diagnoseMobileScroll(page);
  await testCommandListScroll(page);

  await browser.close();
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});