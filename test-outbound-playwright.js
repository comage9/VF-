const { chromium } = require('playwright');

async function testOutboundPage() {
  console.log('='.repeat(70));
  console.log('Playwright Test: VF Outbound Page');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Console error collector
  const consoleErrors = [];
  const consoleWarnings = [];
  const consoleLogs = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const timestamp = new Date().toISOString();

    if (type === 'error') {
      consoleErrors.push({ timestamp, text, type: 'error' });
      console.log(`[ERROR ${timestamp}] ${text}`);
    } else if (type === 'warning') {
      consoleWarnings.push({ timestamp, text, type: 'warning' });
      console.log(`[WARN ${timestamp}] ${text}`);
    } else if (type === 'log') {
      consoleLogs.push({ timestamp, text, type: 'log' });
      console.log(`[LOG ${timestamp}] ${text}`);
    }
  });

  // Network request/response collector
  const networkRequests = [];
  const networkFailures = [];

  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    networkRequests.push({ url, method, timestamp: new Date().toISOString() });
    console.log(`[REQUEST] ${method} ${url}`);
  });

  page.on('response', async response => {
    const url = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || 'unknown';

    console.log(`[RESPONSE] ${status} ${url} (${contentType})`);

    if (status >= 400) {
      networkFailures.push({
        url,
        status,
        contentType,
        timestamp: new Date().toISOString()
      });

      // Try to get error body
      try {
        const body = await response.text();
        console.log(`[ERROR BODY] ${body.substring(0, 500)}`);
      } catch (e) {
        console.log(`[ERROR BODY] Could not read body`);
      }
    }
  });

  page.on('requestfailed', request => {
    const url = request.url();
    const failure = request.failure();
    networkFailures.push({
      url,
      error: failure?.errorText || 'Unknown error',
      timestamp: new Date().toISOString(),
      type: 'request_failed'
    });
    console.log(`[REQUEST FAILED] ${url} - ${failure?.errorText || 'Unknown error'}`);
  });

  // Page error handler
  page.on('pageerror', error => {
    consoleErrors.push({
      timestamp: new Date().toISOString(),
      text: error.message,
      stack: error.stack,
      type: 'page_error'
    });
    console.log(`[PAGE ERROR] ${error.message}`);
    if (error.stack) {
      console.log(`[STACK] ${error.stack}`);
    }
  });

  console.log('\n--- Navigating to VF Outbound page ---');
  const url = 'http://localhost:5174/outbound?tab=vf-outbound';
  console.log(`URL: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✓ Page loaded successfully');

    // Wait for page to fully render
    await page.waitForTimeout(5000);

    // Check if VF Outbound tab is active
    console.log('\n--- Checking VF Outbound tab ---');
    const vfTabExists = await page.locator('[data-tab="vf-outbound"]').count() > 0;
    console.log(`VF Outbound tab exists: ${vfTabExists}`);

    // Look for sync buttons
    console.log('\n--- Looking for sync buttons ---');
    const syncButtons = await page.locator('button').allTextContents();
    console.log('Found buttons:', syncButtons);

    // Take a screenshot
    console.log('\n--- Taking screenshot ---');
    await page.screenshot({ path: 'test-logs/outbound-page-screenshot.png', fullPage: true });
    console.log('✓ Screenshot saved to test-logs/outbound-page-screenshot.png');

    // Wait a bit more to capture async errors
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('❌ Error during test:', error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nConsole Errors: ${consoleErrors.length}`);
  consoleErrors.forEach((err, i) => {
    console.log(`  ${i + 1}. [${err.type}] ${err.text}`);
  });

  console.log(`\nConsole Warnings: ${consoleWarnings.length}`);
  consoleWarnings.forEach((warn, i) => {
    console.log(`  ${i + 1}. [${warn.type}] ${warn.text}`);
  });

  console.log(`\nNetwork Failures: ${networkFailures.length}`);
  networkFailures.forEach((fail, i) => {
    console.log(`  ${i + 1}. ${fail.url}`);
    if (fail.status) {
      console.log(`     Status: ${fail.status} ${fail.contentType}`);
    } else if (fail.error) {
      console.log(`     Error: ${fail.error}`);
    }
  });

  // Filter CORS proxy related errors
  console.log('\n--- CORS Proxy Analysis ---');
  const corsProxyErrors = networkFailures.filter(fail =>
    fail.url.includes('localhost:3001') || fail.url.includes('cors')
  );

  if (corsProxyErrors.length > 0) {
    console.log(`Found ${corsProxyErrors.length} CORS proxy related errors:`);
    corsProxyErrors.forEach((fail, i) => {
      console.log(`  ${i + 1}. ${fail.url}`);
      console.log(`     ${fail.status ? `Status: ${fail.status}` : `Error: ${fail.error}`}`);
    });
  } else {
    console.log('No CORS proxy errors found - the issue might be different');
  }

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    url,
    consoleErrors,
    consoleWarnings,
    networkRequests,
    networkFailures,
    summary: {
      errorCount: consoleErrors.length,
      warningCount: consoleWarnings.length,
      requestCount: networkRequests.length,
      failureCount: networkFailures.length
    }
  };

  const fs = require('fs');
  if (!fs.existsSync('test-logs')) {
    fs.mkdirSync('test-logs', { recursive: true });
  }

  fs.writeFileSync(
    'test-logs/playwright-test-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\n✓ Detailed report saved to test-logs/playwright-test-report.json');

  await browser.close();
  console.log('\n' + '='.repeat(70));
  console.log('Test completed');
  console.log('='.repeat(70));

  return report;
}

// Run the test
testOutboundPage()
  .then(() => {
    console.log('\n✓ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
