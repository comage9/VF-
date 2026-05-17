import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

console.log('1. Navigating to production plan...');
await page.goto('http://localhost:5174/production');
await page.waitForLoadState('networkidle');

console.log('2. Page title:', await page.title());

console.log('3. Looking for production plan content...');
const content = await page.content();
const hasProductionPlan = content.includes('생산 계획') || content.includes('production');
console.log('   Has production plan content:', hasProductionPlan);

console.log('4. Testing machine number popover...');
// Look for machine number input/popover trigger
const machineInputs = await page.locator('input[placeholder*="M001"], button:has-text("기계번호")').count();
console.log('   Machine number inputs/buttons found:', machineInputs);

await browser.close();
console.log('\n✅ Playwright test completed successfully!');
