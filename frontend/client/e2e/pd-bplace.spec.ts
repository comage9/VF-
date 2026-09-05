import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 빈 칸 4개에 이유정리함 9개 배치', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  // 실서버 localStorage에 기록하는 작업이므로, 스냅샷 저장용 전용 브라우저 컨텍스트 사용
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 1) 배치 전 백업
  const before = await page.evaluate(() => localStorage.getItem('vf_product_display_v1'));
  fs.writeFileSync(path.join(OUT, '배치전-B동-백업.json'), before);

  // 2) 빈 칸 4개에 배치 (9개: 3+2+2+2)
  const plan = {
    'B-B하단2-1': '642,643,647',
    'B-B하단2-2': '648,649',
    'B-B하단2-3': '650,693',
    'B-B하단2-4': '694,696',
  };
  const result = await page.evaluate((plan) => {
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const data = v.data;
    const applied = {};
    for (const [zid, val] of Object.entries(plan)) {
      const prev = data[zid] || '';
      // 기존 값이 비어있을 때만 배치 (있으면 병합)
      data[zid] = prev.trim() ? prev + ',' + val : val;
      applied[zid] = { prev, now: data[zid] };
    }
    localStorage.setItem('vf_product_display_v1', JSON.stringify(v));
    return applied;
  }, plan);

  console.log('=== 배치 적용 결과 ===');
  for (const [zid, r] of Object.entries(result)) console.log(`  ${zid}: "${r.prev}" -> "${r.now}"`);

  // 3) 새로고침해서 화면 반영 확인
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("B동")').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const check = await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const d = v.data;
    return ['B-B하단2-1', 'B-B하단2-2', 'B-B하단2-3', 'B-B하단2-4'].map((z) => ({ id: z, val: d[z] }));
  });
  console.log('\n=== 새로고침 후 data 맵 ===');
  check.forEach((c) => console.log(`  ${c.id} = "${c.val}"`));
  await page.screenshot({ path: path.join(OUT, 'B동-이유정리함-배치후.png') });
  console.log('\n배치 후 스크린샷 저장 완료');
});
