import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('A동 화면 — 칸(버튼) 기준 2031/516 + 주변 로케이션 번호', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    // 모든 절대요소 라벨 (색 무관): 숫자/화살표
    const abs = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 15 || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 5 && r.height > 5 && /^[\d→,]+$/.test(txt);
    }).map((el) => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), color: st.color, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
    });
    // 칸(버튼) 중 A동 그리드 칸: 텍스트가 제품번호(숫자/콤마)이며 작은 크기
    const cells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').replace(/\s+/g, '').trim();
      if (r.width < 30 || r.width > 70 || r.height < 20) return null;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), txt };
    }).filter((c): c is any => !!c);
    // 2031/516 담긴 칸 + 그 칸과 겹치는 amber 라벨(칸 내부 좌상단)
    const amber = abs.filter((a) => /rgb\(217, 119, 6\)/.test(a.color));
    const blue = abs.filter((a) => /rgb\(37, 99, 235\)/.test(a.color)); // 좌표 라벨
    function findCell(pnum: string) {
      const c = cells.find((c) => c.txt.split(',').includes(pnum));
      if (!c) return { pnum, found: false, allTxt: cells.slice(0, 5) };
      const insideAmber = amber.filter((a) => Math.abs(a.y - c.y) < 20 && Math.abs(a.x - c.x) < 40);
      const nearBlue = blue.filter((b) => Math.abs(b.y - c.y) < 25).map((b) => b.txt);
      return { pnum, found: true, cellTxt: c.txt, cx: c.x, cy: c.y, insideAmber: insideAmber.map((a) => a.txt), nearBlueX: [...new Set(nearBlue)].slice(0, 6) };
    }
    return { cellCount: cells.length, amberCount: amber.length, blueCount: blue.length, r2031: findCell('2031'), r516: findCell('516') };
  });
  console.log('칸 수:', out.cellCount, '| amber:', out.amberCount, '| 좌표라벨(blue):', out.blueCount);
  console.log('2031:', JSON.stringify(out.r2031));
  console.log('516:', JSON.stringify(out.r516));
  fs.writeFileSync(path.join(OUT, '516-2031-칸실측.json'), JSON.stringify(out, null, 1));
  await page.screenshot({ path: path.join(OUT, '516-2031-화면2.png') });
});
