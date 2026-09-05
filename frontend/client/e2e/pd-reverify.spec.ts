import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('d39442c 재검증 — 2031/516 위치·번호 + 총괄 스크롤', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  // A동
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
    const amberIn = (c: any) => amber.filter((a) => a.cx >= c.x0 && a.cx <= c.x1 && a.cy >= c.y0 && a.cy <= c.y1).map((a) => a.txt);
    const find = (pn: string) => {
      const c = cells.find((c) => c.txt.split(',').includes(pn));
      return c ? { pn, cx: c.cx, cy: c.cy, amber: amberIn(c) } : { pn, found: false };
    };
    // X라벨 (하단 blue)
    const blues = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!/^\d+$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(37, 99, 235\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const maxY = Math.max(...blues.map((b) => b.y));
    const xLabs = blues.filter((b) => b.y > maxY - 30).sort((a, b) => a.x - b.x);
    const xOf = (cx: number) => { let b = null, bd = 1e9; for (const l of xLabs) { const d = Math.abs(l.x - cx); if (d < bd) { bd = d; b = l; } } return b ? b.txt : null; };
    const f2031 = find('2031'), f516 = find('516');
    return {
      xLabelPos: xLabs.map((l) => `${l.txt}@${Math.round(l.x)}`).join(' '),
      c2031: { ...f2031, x: f2031.found === false ? null : xOf(f2031.cx) },
      c516: { ...f516, x: f516.found === false ? null : xOf(f516.cx) },
      cellsTotal: cells.length,
    };
  });
  console.log('X라벨:', out.xLabelPos);
  console.log('2031:', JSON.stringify(out.c2031));
  console.log('516:', JSON.stringify(out.c516));
  await page.screenshot({ path: path.join(OUT, 'd39442c-재검증.png') });
  fs.writeFileSync(path.join(OUT, 'd39442c-재검증.json'), JSON.stringify(out, null, 1));
});
