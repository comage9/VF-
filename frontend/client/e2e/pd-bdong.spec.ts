import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// B동 미배치 품목("이유 정리함") + 빈 칸 현황 실측 (2026-09-04)
const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 미배치/빈칸 실측', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // B동 탭 클릭
  await page.locator('button:has-text("B동")').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'B동-현황.png') });

  const data = await page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
    // 미배치/배치/임시보관함/패널 영역 텍스트
    const k = Object.keys(localStorage);
    let ls = null;
    for (const key of k) {
      if (/vf_product_display/i.test(key) || /layout/i.test(key)) {
        const v = localStorage.getItem(key);
        if (v && v.length > 100) ls = { key, len: v.length, head: v.slice(0, 300) };
      }
    }
    // "이유" 포함 라인
    const reasonLines = body.filter((l) => l.includes('이유')).slice(0, 30);
    // 카테고리 패널 그룹
    const panels = [...document.querySelectorAll('button, [role="button"], [class*="tab"], [class*="cate"]')]
      .map((b) => (b.textContent || '').trim()).filter(Boolean).filter((t) => t.length < 25).slice(0, 60);
    return { body: body.slice(0, 250), reasonLines, panels, ls, lsKeys: k };
  });
  fs.writeFileSync(path.join(OUT, 'B동-현황.json'), JSON.stringify(data, null, 1));
  console.log('localStorage keys:', data.lsKeys);
  console.log('ls 후보:', data.ls ? { key: data.ls.key, len: data.ls.len } : '없음');
  console.log('이유 포함 라인:', data.reasonLines);
  console.log('패널/버튼:', JSON.stringify(data.panels));
  expect(fs.existsSync(path.join(OUT, 'B동-현황.png'))).toBeTruthy();
});
