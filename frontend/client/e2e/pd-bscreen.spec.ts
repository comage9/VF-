import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 화면 실제 표시 캡처', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // B동 탭 클릭 (정확한 선택자 — 버튼들 중 정확히 'B동')
  const btns = page.locator('button');
  const n = await btns.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const t = (await btns.nth(i).textContent() || '').trim();
    if (t === 'B동') { await btns.nth(i).click(); clicked = true; break; }
  }
  console.log('B동 탭 클릭:', clicked);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'B동-화면실측.png') });
  const body = await page.evaluate(() => {
    const b = (document.body.innerText || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    // 화면에서 그리드 영역 라인 (칸에 표시된 숫자들) — 상단 패널/설명 제외하고 잘라서
    const gridStart = b.findIndex(x => x.includes('배치') || x.includes('칸'));
    return b.slice(0, 260);
  });
  fs.writeFileSync(path.join(OUT, 'B동-화면실측.txt'), body.join('\n'));
  console.log('--- 화면 텍스트 (앞 100줄) ---');
  console.log(body.slice(0, 100).join('\n'));
  expect(fs.existsSync(path.join(OUT, 'B동-화면실측.png'))).toBeTruthy();
});
