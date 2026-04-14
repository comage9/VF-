# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production-plan-dnd.spec.ts >> 생산계획 DnD 테스트 >> 페이지가 정상 로드됨
- Location: e2e/production-plan-dnd.spec.ts:12:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('text=기계') to be visible

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('생산계획 DnD 테스트', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/production');
  6  |     // 테이블 헤더의 "기계" 텍스트가 보일 때까지 대기
> 7  |     await page.waitForSelector('text=기계', { timeout: 10000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  8  |     // 데이터 행이 로드될 때까지 추가 대기
  9  |     await page.waitForTimeout(1000);
  10 |   });
  11 | 
  12 |   test('페이지가 정상 로드됨', async ({ page }) => {
  13 |     await expect(page.locator('h2:has-text("생산 계획 모니터링")')).toBeVisible();
  14 |     await expect(page.locator('table')).toBeVisible();
  15 |   });
  16 | 
  17 |   test('기계 그룹 헤더가 표시됨', async ({ page }) => {
  18 |     const headers = page.locator('tr:has-text("기계번호:")');
  19 |     const count = await headers.count();
  20 |     expect(count).toBeGreaterThan(0);
  21 |   });
  22 | 
  23 |   test('행에 드래그 핸들(그립)이 존재함', async ({ page }) => {
  24 |     // 모든 버튼 개수 확인 (드래그 핸들 버튼)
  25 |     const allButtons = page.locator('table button');
  26 |     const count = await allButtons.count();
  27 |     expect(count).toBeGreaterThan(1);
  28 |   });
  29 | 
  30 |   test('첫 번째 데이터 행의 드래그 버튼 위치 확인', async ({ page }) => {
  31 |     // 테이블 tbody 내 첫 번째 데이터 행의 버튼
  32 |     const firstDataRow = page.locator('tbody tr').nth(1); // 0은 헤더행, 1부터 데이터
  33 |     const buttons = firstDataRow.locator('button');
  34 |     const count = await buttons.count();
  35 |     expect(count).toBeGreaterThan(0);
  36 |   });
  37 | 
  38 |   test('체크박스가 존재함', async ({ page }) => {
  39 |     const checkboxes = page.locator('[role="checkbox"]');
  40 |     const count = await checkboxes.count();
  41 |     expect(count).toBeGreaterThan(0);
  42 |   });
  43 | 
  44 |   test('체크박스 선택 가능함', async ({ page }) => {
  45 |     const firstCheckbox = page.locator('[role="checkbox"]').first();
  46 |     // force: true needed because checkbox is visually hidden (peer pattern)
  47 |     await firstCheckbox.click({ force: true });
  48 |     // 체크 상태 확인
  49 |     const isChecked = await firstCheckbox.getAttribute('aria-checked');
  50 |     expect(isChecked).toBe('true');
  51 |   });
  52 | });
  53 | 
```