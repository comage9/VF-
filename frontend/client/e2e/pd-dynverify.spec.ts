import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('26906b6 재검증 — 칸 품목수=번호수, 1부터 연속', async ({ page }) => {
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
      return { el, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, txt };
    }).filter((c): c is any => !!c);
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!/^[\d→,]+$/.test(txt) || txt.length > 15 || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), cx: r.x + r.width / 2, cy: r.y + r.height / 2, x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height };
    });
    // 각 칸: 제품 수(txt 콤마) 와 그 칸 안 amber
    const rows = cells.map((c) => {
      // UI 버튼(동 탭/줌 등) 제외 — 좌표가 grid 영역(특정 x범위)이고 높이 30~40px만
      if (['총괄','A동','B동','C동','D동','E동','−','＋','기본','🗺️ 지도 뷰'].includes(c.txt)) return null;
      const nProd = c.txt ? c.txt.split(',').filter((s) => /^\d+$/.test(s.trim())).length : 0;
      const inAmber = amber.filter((a) => a.cx >= c.x0 && a.cx <= c.x1 && a.cy >= c.y0 && a.cy <= c.y1).map((a) => a.txt);
      return { cell: c.txt, nProd, amber: inAmber };
    }).filter((r): r is any => !!r && (r.nProd > 0 || r.amber.length > 0));
    // amber 파싱: "37" / "75→77" 등
    const parse = (s: string) => { const m = s.split('→').map(Number); return m.length > 1 ? Array.from({length: m[1]-m[0]+1}, (_,i)=>m[0]+i) : m; };
    const mism = rows.filter((r) => {
      const nAmber = r.amber.reduce((acc, a) => acc + parse(a).length, 0);
      const expect = Math.max(1, r.nProd);
      return nAmber !== expect;
    });
    // 번호 전체 수집해 연속성 확인 (칸 내부 amber만)
    const allNos = rows.flatMap((r) => r.amber.flatMap((a) => parse(a))).sort((a, b) => a - b);
    const uniq = [...new Set(allNos)];
    const maxN = uniq[uniq.length - 1];
    const seqOk = uniq.length === maxN && uniq.every((n, i) => n === i + 1);
    return { cellRows: rows.length, mismatchCount: mism.length, mismSample: mism.slice(0, 8), totalNos: allNos.length, min: uniq[0], max: maxN, sequential: seqOk, dupCount: allNos.length - uniq.length };
  });
  console.log('품목수≠번호수 불일치 칸:', out.mismatchCount, '/', out.cellRows);
  out.mismSample.forEach((m: any) => console.log(`  칸[${m.cell}] 품목${m.nProd} amber=${JSON.stringify(m.amber)}`));
  console.log('번호 총', out.totalNos, '| min', out.min, '| max', out.max, '| 1부터 연속?', out.sequential, '| 중복', out.dupCount);
  fs.writeFileSync(path.join(OUT, '26906b6-재검증.json'), JSON.stringify(out, null, 1));
  await page.screenshot({ path: path.join(OUT, '26906b6-재검증-ADong.png') });
});
