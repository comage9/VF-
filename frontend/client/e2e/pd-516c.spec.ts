import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('A동 — 가로(X)/세로(Y) 좌표 라벨 위치와 516·2031 칸 대조', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const blue = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!/^\d+$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(37, 99, 235\)/.test(st.color);
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    const cells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').replace(/\s+/g, '').trim();
      if (r.width < 30 || r.width > 70 || r.height < 20) return null;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), txt };
    }).filter((c): c is any => !!c);
    // X(가로) 라벨 = blue 중 y가 가장 큰 그룹(하단) / Y(세로) 라벨 = blue 중 좌우 끝
    const maxY = Math.max(...blue.map((b) => b.y));
    const xLabels = blue.filter((b) => b.y > maxY - 30).sort((a, b) => a.x - b.x);
    const yLabels = blue.filter((b) => b.y <= maxY - 30);
    const yLeft = yLabels.filter((b) => b.x < 300).sort((a, b) => b.y - a.y); // 왼쪽 세로 (위→아래)
    const c516 = cells.find((c) => c.txt.split(',').includes('516'));
    const c2031 = cells.find((c) => c.txt.split(',').includes('2031'));
    // x 중심이 어느 X 라벨 구간인지
    const xOf = (cx: number) => {
      let best = null, bestD = 1e9;
      for (const l of xLabels) { const d = Math.abs(l.x - cx); if (d < bestD) { bestD = d; best = l; } }
      return best ? { xLabel: best.txt, dist: bestD } : null;
    };
    const yOf = (cy: number) => {
      let best = null, bestD = 1e9;
      for (const l of yLeft) { const d = Math.abs(l.y - cy); if (d < bestD) { bestD = d; best = l; } }
      return best ? { yLabel: best.txt, dist: bestD } : null;
    };
    return {
      xLabelPos: xLabels.map((l) => `X${l.txt}@${l.x}`).join(' '),
      yLabelCount: yLeft.length,
      c516: c516 ? { txt: c516.txt, ...xOf(c516.x), ...yOf(c516.y) } : null,
      c2031: c2031 ? { txt: c2031.txt, ...xOf(c2031.x), ...yOf(c2031.y) } : null,
    };
  });
  console.log('가로 X 라벨:', out.xLabelPos);
  console.log('세로 Y 라벨 수:', out.yLabelCount);
  console.log('516 칸 좌표:', JSON.stringify(out.c516));
  console.log('2031 칸 좌표:', JSON.stringify(out.c2031));
  fs.writeFileSync(path.join(OUT, '516-2031-좌표확정.json'), JSON.stringify(out, null, 1));
});
