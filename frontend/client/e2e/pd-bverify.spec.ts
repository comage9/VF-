import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 배치 후 화면 검증', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // 서버 340 반영 위해 — 새 헤드리스 컨텍스트(localStorage 비어있음)라 서버에서 로드됨
  const ver = await page.evaluate(() => localStorage.getItem('vf_pd_savedat_v1'));
  console.log('savedat:', ver ? ver.slice(0, 100) : '(없음 — 서버 로드 대기)');
  await page.waitForTimeout(2000);
  // B동 탭
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'B동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(2500);
  const check = await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const d = v.data;
    return ['B-B하단2-1','B-B하단2-2','B-B하단2-3','B-B하단2-4'].map((z) => ({ id: z, val: d[z] }));
  });
  console.log('=== localStorage 반영 확인 ===');
  check.forEach((c) => console.log(`  ${c.id} = "${c.val}"`));
  const body = (await page.locator('body').innerText()).split('\n').map((s) => s.trim()).filter((s) => /^64[0-9]$|^693$|^694$|^696$/.test(s));
  console.log('화면에 보이는 배치 번호(642~699 중):', [...new Set(body)]);
  await page.screenshot({ path: path.join(OUT, 'B동-이유정리함-배치후-화면.png') });
});
