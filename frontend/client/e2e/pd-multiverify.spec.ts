import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
// 데이터 기준 다품목 칸 + 화면 amber 대조
const MULTI: Record<string, number> = {
  'A-L3-16':2,'A-L3-18':2,'A-L4-15':2,'A-L4-16':2,'A-L4-17':3,'A-L5-11':2,'A-L5-15':2,'A-L5-17':2,'A-L5-18':2,'A-L5-9':2,
  'A-L6-10':2,'A-L6-12':2,'A-L6-14':2,'A-L6-15':2,'A-L6-16':3,'A-L6-17':2,'A-L6-18':2,'A-L6-9':2,'A-L7-1':2,'A-L7-3':2,'A-L7-8':2
};

test('다품목 칸 번호 수 + 1~N 연속성 (데이터 대조)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate((MULTI: Record<string, number>) => {
    // 레이아웃에서 존 id → 화면 좌표 (data와 동일 localStorage)
    const L = JSON.parse(localStorage.getItem('vf_product_display_layout_v1'));
    const layers = L.layout || L;
    let aZones: any[] = [];
    (function find(node: any, depth = 0) {
      if (!node || typeof node !== 'object' || depth > 5) return;
      if (Array.isArray(node)) { node.forEach((x) => find(x, depth + 1)); return; }
      if (Array.isArray(node.zones) && node.key === 'A') { aZones = node.zones; return; }
      for (const v of Object.values(node)) find(v, depth + 1);
    })(layers);
    // 각 존의 화면 rect (스케일 반영 — container transform 포함이므로 getBoundingClientRect 사용 불가. style.left/top * zoom(1.2)+패딩 추정 대신, DOM에서 버튼 찾기)
    // 대신: amber 라벨 전부 (절대위치), 텍스트는 "N" 또는 "A→B"
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || txt.length > 10 || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), cx: r.x + r.width / 2, cy: r.y + r.height / 2, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height }; });
    // 존 rect: style.left/top은 원본 좌표 — 화면 배율(zoom)과 컨테이너 오프셋을 알기 어려움.
    // 화면 버튼 중 해당 존의 제품(첫 제품)을 찾아 rect로.
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const data = v.data;
    const parse = (s: string) => { const p = s.split('→').map(Number); return p.length > 1 ? Array.from({ length: p[1] - p[0] + 1 }, (_, i) => p[0] + i) : p; };
    const results: any[] = [];
    for (const [zid, expectN] of Object.entries(MULTI)) {
      const val = String(data[zid] || '');
      const pns = val.split(',').filter(Boolean);
      // 칸 버튼 찾기: 해당 제품 첫번째 포함
      const btn = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').replace(/\s+/g, '').includes(pns[0]));
      if (!btn) { results.push({ zid, found: false }); continue; }
      const r = btn.getBoundingClientRect();
      const inAmber = amber.filter((a) => a.cx >= r.x - 2 && a.cx <= r.x + r.width + 2 && a.cy >= r.y - 2 && a.cy <= r.y + r.height + 2);
      const nos = inAmber.flatMap((a) => parse(a.txt));
      results.push({ zid, expectN, gotN: inAmber.length, nos, found: true });
    }
    // 모든 amber 번호 모아 연속성
    const all = amber.flatMap((a) => parse(a.txt)).sort((a, b) => a - b);
    const uniq = [...new Set(all)];
    return { results, totalAmber: all.length, min: uniq[0], max: uniq[uniq.length - 1], uniqCount: uniq.length, hasDup: all.length !== uniq.length };
  }, MULTI);
  console.log('=== 다품목 칸 번호 개수 대조 ===');
  let bad = 0;
  out.results.forEach((r: any) => {
    const ok = r.found && r.gotN === r.expectN;
    if (!ok) bad++;
    console.log(`  ${r.zid}: 기대 ${r.expectN}개 실제 ${r.found ? r.gotN + '개 ' + JSON.stringify(r.nos) : '칸 못 찾음'} ${ok ? '✅' : '❌'}`);
  });
  console.log(`\n불일치: ${bad}/${out.results.length}`);
  console.log('amber 총', out.totalAmber, '| min', out.min, '| max', out.max, '| 고유', out.uniqCount, '| 중복', out.hasDup ? '있음❌' : '없음✅');
  fs.writeFileSync(path.join(OUT, '26906b6-다품목검증.json'), JSON.stringify(out, null, 1));
});
