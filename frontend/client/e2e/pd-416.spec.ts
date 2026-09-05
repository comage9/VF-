import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('A-L4-16 (4,18) 영역 amber 상세', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    // 제품 115 또는 111이 든 버튼(칸) 찾기
    const cells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect(); const txt = (el.textContent || '').replace(/\s+/g, '');
      return { el, txt, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }).filter((c) => c.txt && /^\d[\d,]+$/.test(c.txt));
    const c115 = cells.find((c) => c.txt.split(',').includes('115'));
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
    // c115 칸과 같은 행(y 근접) 또는 가까운 amber들
    const near = c115 ? amber.filter((a) => Math.abs(a.cy - c115.cy) < 25 && Math.abs(a.cx - c115.cx) < 120).map((a) => `${a.txt}@(${Math.round(a.cx)},${Math.round(a.cy)})`) : [];
    const allAmberSorted = amber.sort((a, b) => a.cy - b.cy).slice(0, 60).map((a) => `${a.txt}@y${Math.round(a.cy)}`);
    return { c115: c115 ? { txt: c115.txt, x0: Math.round(c115.x0), x1: Math.round(c115.x1), y0: Math.round(c115.y0), y1: Math.round(c115.y1) } : null, nearAmber: near, firstAmbers: allAmberSorted.slice(0, 45) };
  });
  console.log('115 칸:', JSON.stringify(out.c115));
  console.log('근접 amber:', out.nearAmber);
  console.log('위쪽 amber(행순):', out.firstAmbers.join(' '));
  fs.writeFileSync(path.join(OUT, '26906b6-L4-16상세.json'), JSON.stringify(out, null, 1));
});
