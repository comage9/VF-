import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('총괄 미니맵 — 오버레이 번호가 칸과 정합하는지 픽셀 검증', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === '총괄') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    // 오버레이 amber 번호 (fontWeight 700, amber) — 각각 위치
    const labels = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      return /rgb\(217, 119, 6\)|#d97706|amber/.test(st.color + (el.className || '')) && /^[\d→,]+$/.test(txt) && txt.length <= 15 && st.fontWeight === '700' && st.position === 'absolute';
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), el: el };
    });
    // 같은 컨테이너의 칸(미니맵 셀) — button 등
    const allCells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) return null;
      // 칸 내용(제품번호/빈칸) 
      const content = (el.textContent || '').replace(/\s+/g, '').slice(0, 12);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), content };
    }).filter(Boolean) as { x: number; y: number; w: number; h: number; content: string }[];
    return {
      labelCount: labels.length,
      cellCount: allCells.length,
      sampleLabels: labels.slice(0, 8).map((l) => ({ t: l.text, cx: l.cx, cy: l.cy })),
      sampleCells: allCells.slice(0, 8),
      // 라벨 중앙이 어떤 칸 영역 안에 들어가는지 비율
      labelInsideCell: labels.filter((l) => allCells.some((c) => l.cx >= c.x && l.cx <= c.x + c.w && l.cy >= c.y && l.cy <= c.y + c.h)).length,
    };
  });
  console.log('오버레이 라벨:', out.labelCount, '| 감지된 칸:', out.cellCount);
  console.log('라벨이 칸 영역 안에 들어간 수:', out.labelInsideCell);
  console.log('라벨 샘플:', JSON.stringify(out.sampleLabels));
  console.log('칸 샘플:', JSON.stringify(out.sampleCells));
  fs.writeFileSync(path.join(OUT, '5db2a07-픽셀정합.json'), JSON.stringify(out, null, 1));
});
