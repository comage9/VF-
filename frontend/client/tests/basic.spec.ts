import { test, expect } from '@playwright/test';

test.describe('VF Website Basic Tests', () => {
  test('should load homepage and verify title', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await expect(page).toHaveTitle(/VF/); // Adjust regex based on actual title
  });

  test('should take screenshot of homepage', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.screenshot({ path: 'screenshots/homepage.png' });
  });
});