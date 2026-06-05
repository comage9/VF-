import { test, expect } from '@playwright/test';

test('VF basic test', async ({ page }) => {
  // 1. Navigate to homepage
  await page.goto('http://localhost:5174');

  // 2. Check page title
  await expect(page).toHaveTitle(/VF.*/);

  // 3. Take screenshot
  await page.screenshot({ path: 'tests/screenshots/homepage.png' });
});