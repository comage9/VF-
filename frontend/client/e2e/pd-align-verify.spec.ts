import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('A동 표준 그리드 정렬 검증 — data-zone-id 기준 칸별 로케이션 번호', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const targetIds = ['A-L4-12', 'A-L4-14', 'A-L4-19', 'A-L3-13', 'A-L5-16', 'A-L7-2', 'A-NEW-91001', 'A-NEW-41901', 'A-NEW-15274'];
    const amber = [...document.querySelectorAll('*')]
      .map((el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const txt = (el.textContent || '').trim();
        return { el, st, txt, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height };
      })
      .filter((o) => o.txt && o.txt.length <= 16 && /^[\d→,]+$/.test(o.txt) && (o.x1 - o.x0) > 2 && (o.y1 - o.y0) > 2 && /rgb\(217, 119, 6\)/.test(o.st.color))
      .map((o) => ({ txt: o.txt, cx: (o.x0 + o.x1) / 2, cy: (o.y0 + o.y1) / 2 }));
    const cells: Record<string, any> = {};
    for (const id of targetIds) {
      const el = document.querySelector(`[data-zone-id="${id}"]`);
      if (!el) { cells[id] = { found: false }; continue; }
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').replace(/\s+/g, '').trim();
      const innerAmber = amber.filter((a) => a.cx >= r.x - 1 && a.cx <= r.x + r.width + 1 && a.cy >= r.y - 1 && a.cy <= r.y + r.height + 1).map((a) => a.txt);
      cells[id] = { found: true, cellTxt: txt, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), amberIn: [...new Set(innerAmber)] };
    }
    return { cells };
  });
  for (const [k, v] of Object.entries(out.cells)) console.log(k, JSON.stringify(v));
  fs.writeFileSync(path.join(OUT, '정렬검증-표준그리드.json'), JSON.stringify(out, null, 1));
  await page.screenshot({ path: path.join(OUT, '정렬검증-표준그리드.png') });
});
