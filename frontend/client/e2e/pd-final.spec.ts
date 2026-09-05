import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('26906b6 최종 — 존좌표↔amber 1:1 (layout style 기반)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const L = JSON.parse(localStorage.getItem('vf_product_display_layout_v1'));
    const layers = L.layout || L;
    let aZones: any[] = [];
    (function find(node: any, depth = 0) {
      if (!node || typeof node !== 'object' || depth > 5) return;
      if (Array.isArray(node)) { node.forEach((x) => find(x, depth + 1)); return; }
      if (Array.isArray(node.zones) && node.key === 'A') { aZones = node.zones; return; }
      for (const v of Object.values(node)) find(v, depth + 1);
    })(layers);
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const data = v.data;
    // 줌 배율 얻기: A동 기본 1.2 (DONG_DEFAULT_ZOOM) + 컨테이너 오프셋 — 실제 화면 scale transform 찾기
    // 간단: 컨테이너 transform scale 값
    const scaled = document.querySelector('[style*="scale("]') || document.querySelector('[style*="transform"]');
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || txt.length > 10 || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), x: r.x, y: r.y, x1: r.x + r.width, y1: r.y + r.height }; });
    // 존 style.left/top → 화면 좌표: scale 컨테이너의 boundingRect + transform-origin 필요.
    // 회피: 화면 버튼(칸)을 존의 첫 제품으로 찾아 rect로 amber 대조
    const cells = [...document.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect(); const txt = (el.textContent || '').replace(/\s+/g, '');
      return { txt, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height };
    }).filter((c) => /^[\d,]+$/.test(c.txt) && c.x1 - c.x0 > 25 && c.x1 - c.x0 < 75);
    const res: any[] = [];
    for (const z of aZones) {
      const val = String(data[z.id] || '');
      const pns = val.split(',').filter(Boolean);
      if (!pns.length) continue; // 빈칸은 번호 존재만 확인
      const cell = cells.find((c) => c.txt.split(',').includes(pns[0]));
      if (!cell) { res.push({ zid: z.id, pns, found: false }); continue; }
      const inAmber = amber.filter((a) => a.x < cell.x1 + 2 && a.x1 > cell.x0 - 2 && a.y < cell.y1 + 2 && a.y1 > cell.y0 - 2);
      const numStr = inAmber.map((a) => a.txt);
      // 범위 라벨 확장
      const parse = (s: string) => { const p = s.split('→').map(Number); return p.length > 1 ? Array.from({ length: p[1] - p[0] + 1 }, (_, i) => p[0] + i) : p; };
      const nos = numStr.flatMap(parse);
      res.push({ zid: z.id, pns, nProd: pns.length, amberRaw: numStr, nos, nShown: nos.length, found: true });
    }
    return { results: res };
  });
  fs.writeFileSync(path.join(OUT, '26906b6-최종.json'), JSON.stringify(out, null, 1));
  const bad = out.results.filter((r: any) => !r.found || r.nShown !== Math.max(1, r.nProd));
  console.log('A동 배치 존:', out.results.length, '| 불일치:', bad.length);
  bad.slice(0, 15).forEach((r: any) => console.log(`  ${r.zid}: 품목${r.nProd} [${r.pns}] 표시${r.found ? r.nShown + ' ' + JSON.stringify(r.amberRaw) : '칸못찾음'}`));
  console.log(bad.length === 0 ? '✅ 전 존 품목수=표시번호수 일치' : '❌ 불일치 존재');
});
