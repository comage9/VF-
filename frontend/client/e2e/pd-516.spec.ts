import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('A동 화면 — 2031/516 칸 위치와 그 칸 로케이션 번호 실측', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    // 모든 절대 위치 텍스트 요소: 제품번호(진한 코발트) / 로케이션(amber)
    const els = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 15 || st.position !== 'absolute') return false;
      if (!/^[\d→,]+$/.test(txt)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 5 && r.height > 5;
    }).map((el) => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').trim();
      const color = st.color;
      let kind = 'other';
      if (/217, 119, 6/.test(color)) kind = 'loc';      // amber = 로케이션
      else if (/30, 58, 138/.test(color)) kind = 'prod'; // 진한 코발트 = 제품번호
      return { kind, txt, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) };
    });
    const prods = els.filter((e) => e.kind === 'prod');
    const locs = els.filter((e) => e.kind === 'loc');
    // 2031/516 칸 찾기 — 같은 y 영역에 붙은 loc (칸 위/안)
    function cellLoc(pnum: string) {
      const p = prods.find((e) => e.txt === pnum);
      if (!p) return { pnum, found: false };
      // 가장 가까운 loc (y 차이 20px 이내, x 근접)
      const near = locs
        .filter((l) => Math.abs(l.y - p.y) <= 25 && Math.abs(l.x - p.x) <= 60)
        .sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)));
      return { pnum, found: true, px: p.x, py: p.y, nearLoc: near.slice(0, 3).map((l) => ({ txt: l.txt, x: l.x, y: l.y })) };
    }
    return { prodCount: prods.length, locCount: locs.length, c2031: cellLoc('2031'), c516: cellLoc('516'), c2032: cellLoc('2032') };
  });
  console.log('제품 라벨 수:', out.prodCount, '| 로케이션 라벨 수:', out.locCount);
  console.log('2031 칸:', JSON.stringify(out.c2031));
  console.log('516 칸:', JSON.stringify(out.c516));
  console.log('2032 칸:', JSON.stringify(out.c2032));
  fs.writeFileSync(path.join(OUT, '516-2031-실측.json'), JSON.stringify(out, null, 1));
  await page.screenshot({ path: path.join(OUT, '516-2031-화면.png') });
});
