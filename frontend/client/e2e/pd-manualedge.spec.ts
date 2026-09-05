import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('manual 엣지 — 앞번호 지정 시 중복 발생 확인', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(1500);

  // A-L4-12 (2031) 칸: 현재 번호 확인 (첫 번째? 아님 rank순)
  // 실제 첫 칸 (9,21)=A-L1-19 제품 1 → 1번. manual로 A-L4-12에 10 지정하면?
  // 먼저 화면의 현재 번호 분포 확인 (수동없이)
  const before = await page.evaluate(() => {
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), x: r.x, y: r.y }; });
    // 2031(제품) 칸 rect 찾아 그 칸 amber
    const cell = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').replace(/\s+/g, '').includes('2031'));
    const r = cell?.getBoundingClientRect();
    const inCell = r ? amber.filter((a) => a.x > r.x - 5 && a.x < r.x + r.width + 5 && a.y > r.y - 5 && a.y < r.y + r.height + 5).map((a) => a.txt) : [];
    return { amberTotal: amber.length, inCell };
  });
  console.log('수동 전: 총 amber', before.amberTotal, '| 2031칸 amber', before.inCell);
  fs.writeFileSync(path.join(OUT, 'manual-엣지-전.json'), JSON.stringify(before, null, 1));
});
