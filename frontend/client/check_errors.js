import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pages = [
    { name: '/delivery', url: 'http://localhost:5174/delivery' },
    { name: '/outbound', url: 'http://localhost:5174/outbound' },
    { name: '/inventory/enhanced', url: 'http://localhost:5174/inventory/enhanced' },
    { name: '/production', url: 'http://localhost:5174/production' },
    { name: '/production-app', url: 'http://localhost:5174/production-app' },
    { name: '/master', url: 'http://localhost:5174/master' }
  ];

  const results = [];

  for (const p of pages) {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    console.log(`Testing ${p.name}...`);
    try {
      await page.goto(p.url, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      
      results.push({
        page: p.name,
        errorCount: consoleErrors.length,
        errors: consoleErrors
      });
    } catch (e) {
      results.push({
        page: p.name,
        errorCount: 1,
        errors: [`Failed to load: ${e.message}`]
      });
    }
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
