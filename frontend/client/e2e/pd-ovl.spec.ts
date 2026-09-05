import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('총괄 오버레이 위치 실측 — 미니맵 정합 검증', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // 총괄 탭
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === '총괄') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '총괄-5db2a07-검증.png') });

  const out = await page.evaluate(() => {
    // 오버레이(amber 번호) DOM 요소들의 화면 좌표와, 그 아래 미니맵 칸 위치를 대조
    const ambers = [...document.querySelectorAll('[class*="amber"], [class*="text-amber"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter((a) => a.text && /^[\d→,]+$/.test(a.text) && a.text.length <= 12);
    // 미니맵 칸(zone 버튼/div)들
    const cells = [...document.querySelectorAll('[class*="absolute"]')].filter((el) => el.getBoundingClientRect().width > 0).slice(0, 5);
    return {
      amberCount: ambers.length,
      ambers: ambers.slice(0, 40),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  fs.writeFileSync(path.join(OUT, '총괄-오버레이-실측.json'), JSON.stringify(out, null, 1));
  console.log('amber 오버레이 요소 수:', out.amberCount);
  console.log('샘플(텍스트/x/y):');
  out.ambers.slice(0, 20).forEach((a) => console.log(`  "${a.text}" @ (${a.x},${a.y}) ${a.w}x${a.h}`));
  console.log('뷰포트:', out.viewport);
});
