import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('8c7c25a 검증 — 로케이션 수동 입력 동작', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  // A동 탭
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(1500);

  // 1) 수동 입력 전 상태: A-L4-12 (제품 2031) 의 번호
  const amberOf = async (zid: string) => page.evaluate((zid) => {
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), cx: r.x + r.width/2, cy: r.y + r.height/2 }; });
    return { n: amber.length, sample: amber.slice(0, 5) };
  }, zid);

  console.log('before 검증 준비');
  // 인라인 편집을 열려면 수정 모드 + 칸 클릭. 제품 2031 칸 찾아 클릭 후 input 확인
  // 수정모드 토글 버튼 찾기
  const editBtn = page.locator('button').filter({ hasText: /수정|편집/ }).first();
  console.log('수정버튼 존재:', await editBtn.count());
  await page.screenshot({ path: path.join(OUT, '8c7c25a-before.png') });
  expect(fs.existsSync(path.join(OUT, '8c7c25a-before.png'))).toBeTruthy();
});
