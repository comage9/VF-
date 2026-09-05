import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('총괄 A동 미니맵 셀 vs 오버레이 라벨 정밀 대조', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === '총괄') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    // 오버레이 라벨
    const labels = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      return /rgb\(217, 119, 6\)/.test(st.color) && /^[\d→,]+$/.test(txt) && txt.length <= 15 && st.fontWeight === '700' && st.position === 'absolute';
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), outOfView: r.bottom > window.innerHeight || r.top < 0 || r.right > window.innerWidth || r.left < 0 };
    });
    // 미니맵 셀: 부모 컨테이너가 transform 적용된(미니맵) 영역 — 버튼 중 텍스트가 숫자/빈 작은 셀
    // A동 미니맵 영역 추정: 좌측 ~244부터. 배치도 셀 = 내용이 제품번호거나 비어있는 것들.
    // 더 정확히: amber 라벨의 부모 체인에서 공통 조상(미니맵 컨테이너) 찾기
    const firstLabel = labels[0] ? (labels[0] as any).__node || null : null;
    // 모든 button/cell 후보 — 40px 내외 작은 것
    const smallCells = [...document.querySelectorAll('button, [role="button"]')].map((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 15 || r.width > 80 || r.height < 10 || r.height > 80) return null;
      const txt = (el.textContent || '').trim();
      // 좌표 라벨/버튼 제외 (숫자 외)
      if (['총괄','A동','B동','C동','D동','E동','−','＋','지도','기본','초기화'].includes(txt)) return null;
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), txt: txt.slice(0, 10) };
    }).filter(Boolean) as any[];
    // 스크롤 영역 정보
    const scrollers = [...document.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 50).slice(0, 5).map((el) => ({ cls: (el.className || '').toString().slice(0, 50), ch: el.clientHeight, sh: el.scrollHeight }));
    return {
      labelCount: labels.length,
      labelsOutOfView: labels.filter((l: any) => l.outOfView).map((l: any) => ({ t: l.text, x: l.x, y: l.y })),
      smallCellCount: smallCells.length,
      smallCells: smallCells.slice(0, 15),
      scrollers,
    };
  });
  console.log('라벨 총:', out.labelCount, '| 화면 밖 라벨:', out.labelsOutOfView.length);
  console.log('화면 밖 라벨:', JSON.stringify(out.labelsOutOfView.slice(0, 10)));
  console.log('작은 셀 수:', out.smallCellCount, '| 샘플:', JSON.stringify(out.smallCells));
  console.log('스크롤 컨테이너:', JSON.stringify(out.scrollers));
  fs.writeFileSync(path.join(OUT, '5db2a07-정밀픽셀.json'), JSON.stringify(out, null, 1));
});
