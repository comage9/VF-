import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('이유정리함 전 동 배치 위치 대조', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const data = v.data;
    // 이유 정리함 후보 번호 (마스터 category_lg=이유 정리함)
    const reason = ['642','643','647','648','649','650','689','690','691','692','693','694','695','696','697','698','699','2145','2146'];
    const hits = {};
    for (const pn of reason) {
      const found = [];
      for (const [zid, val] of Object.entries(data)) {
        if (String(val).split(',').includes(pn)) found.push(zid);
      }
      hits[pn] = found;
    }
    return hits;
  });
  fs.writeFileSync(path.join(OUT, '이유정리함-위치.json'), JSON.stringify(out, null, 1));
  console.log('=== 이유 정리함 19품목 배치 위치 ===');
  for (const [pn, zones] of Object.entries(out)) {
    console.log(`  ${pn}: ${zones.length ? zones.join(', ') : '미배치'}`);
  }
});
