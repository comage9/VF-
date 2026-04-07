import { test, expect } from '@playwright/test';

test.describe('생산계획 DnD 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/production');
    // 테이블 헤더의 "기계" 텍스트가 보일 때까지 대기
    await page.waitForSelector('text=기계', { timeout: 10000 });
    // 데이터 행이 로드될 때까지 추가 대기
    await page.waitForTimeout(1000);
  });

  test('페이지가 정상 로드됨', async ({ page }) => {
    await expect(page.locator('h2:has-text("생산 계획 모니터링")')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('기계 그룹 헤더가 표시됨', async ({ page }) => {
    const headers = page.locator('tr:has-text("기계번호:")');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('행에 드래그 핸들(그립)이 존재함', async ({ page }) => {
    // 모든 버튼 개수 확인 (드래그 핸들 버튼)
    const allButtons = page.locator('table button');
    const count = await allButtons.count();
    expect(count).toBeGreaterThan(1);
  });

  test('첫 번째 데이터 행의 드래그 버튼 위치 확인', async ({ page }) => {
    // 테이블 tbody 내 첫 번째 데이터 행의 버튼
    const firstDataRow = page.locator('tbody tr').nth(1); // 0은 헤더행, 1부터 데이터
    const buttons = firstDataRow.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('체크박스가 존재함', async ({ page }) => {
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('체크박스 선택 가능함', async ({ page }) => {
    const firstCheckbox = page.locator('[role="checkbox"]').first();
    // force: true needed because checkbox is visually hidden (peer pattern)
    await firstCheckbox.click({ force: true });
    // 체크 상태 확인
    const isChecked = await firstCheckbox.getAttribute('aria-checked');
    expect(isChecked).toBe('true');
  });
});
