const { chromium } = require('playwright');

async function testVFTabSimple() {
  console.log('=== Simple VF Tab Test ===');

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--disable-web-security']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Collect console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${text}`);
    }
  });

  try {
    // Navigate to VF Outbound page
    console.log('Navigating to VF Outbound page...');
    await page.goto('http://localhost:5174/outbound?tab=vf-outbound', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    await page.waitForTimeout(5000);

    // Check for tab buttons
    console.log('\n--- Checking for tab buttons ---');
    const tabButtons = await page.locator('button').all();
    console.log(`Found ${tabButtons.length} buttons on the page`);

    for (const btn of tabButtons) {
      try {
        const text = await btn.textContent();
        const dataTab = await btn.getAttribute('data-tab');
        if (dataTab) {
          console.log(`Tab button found: "${text}" with data-tab="${dataTab}"`);
        } else if (text && text.includes('VF') || text.includes('출고')) {
          console.log(`Potential tab button: "${text}"`);
        }
      } catch (e) {
        // Skip buttons that can't be accessed
      }
    }

    // Look specifically for VF Outbound tab
    console.log('\n--- Looking for VF Outbound tab ---');
    const vfTab = await page.locator('[data-tab="vf-outbound"]').count();
    console.log(`VF Outbound tab count: ${vfTab}`);

    const defaultTab = await page.locator('[data-tab="default"]').count();
    console.log(`Default tab count: ${defaultTab}`);

    // Check active tab
    console.log('\n--- Checking active tab ---');
    const activeTab = await page.locator('.tab-button.active').count();
    console.log(`Active tab count: ${activeTab}`);

    if (activeTab > 0) {
      const activeTabText = await page.locator('.tab-button.active').textContent();
      console.log(`Active tab text: "${activeTabText}"`);
    }

    // Take screenshot
    console.log('\n--- Taking screenshot ---');
    await page.screenshot({
      path: 'test-logs/vf-tab-simple-screenshot.png',
      fullPage: true
    });
    console.log('Screenshot saved');

    // Check page title and URL
    console.log('\n--- Page information ---');
    const title = await page.title();
    console.log(`Page title: ${title}`);
    const url = page.url();
    console.log(`Current URL: ${url}`);

  } catch (error) {
    console.error('Test error:', error.message);
  }

  console.log('\n=== Test Complete ===');
  await browser.close();
}

// Run the test
testVFTabSimple()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
