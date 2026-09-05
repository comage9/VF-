import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('516 칸 내부에 표시된 로케이션 번호 정밀 확인', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').replace(/\s+/g, '').trim();
      if (r.width < 30 || r.width > 70 || r.height < 20) return null;
      return { el, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), txt };
    }).filter((c): c is any => !!c);
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!/^[\d→,]+$/.test(txt) || txt.length > 15 || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height };
    });
    // 516/2031 칸 rect 안에 들어가는 amber (완전 포함 또는 교차)
    function amberIn(c: any) {
      return amber.filter((a) => a.cx >= c.x0 && a.cx <= c.x1 && a.cy >= c.y0 && a.cy <= c.y1).map((a) => a.txt);
    }
    const c516 = cells.find((c) => c.txt.split(',').includes('516'));
    const c2031 = cells.find((c) => c.txt.split(',').includes('2031'));
    return {
      c516: c516 ? { txt: c516.txt, cx: c516.cx, cy: c516.cy, amber: amberIn(c516) } : null,
      c2031: c2031 ? { txt: c2031.txt, cx: c2031.cx, cy: c2031.cy, amber: amberIn(c2031) } : null,
    };
  });
  console.log('516:', JSON.stringify(out.c516));
  console.log('2031:', JSON.stringify(out.c2031));
  fs.writeFileSync(path.join(OUT, '516-2031-칸내부.json'), JSON.stringify(out, null, 1));
  await page.screenshot({ path: path.join(OUT, '516-2031-최종.png') });
});
