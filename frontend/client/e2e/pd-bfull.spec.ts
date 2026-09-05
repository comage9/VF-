import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
const REASON = ['642', '643', '647', '648', '649', '650', '689', '690', '691', '692', '693', '694', '695', '696', '697', '698', '699', '2145', '2146'];

test('B동 배치 전체 + 이유정리함 위치 대조', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vf_product_display_v1'));
    const data = v.data;
    const bZones = Object.entries(data).filter(([k]) => String(k).startsWith('B'));
    const filled = bZones.filter(([, val]) => String(val).trim().length > 0);
    const empty = bZones.filter(([, val]) => !String(val).trim().length);
    return { bTotal: bZones.length, filled: filled.map(([k, val]) => ({ id: k, val })), empty: empty.map(([k]) => k) };
  });
  fs.writeFileSync(path.join(OUT, 'B동-배치-전체.json'), JSON.stringify(out, null, 1));
  console.log('B동 존:', out.bTotal, '| 채워짐:', out.filled.length, '| 빈칸:', out.empty.length);
  console.log('\n=== 채워진 B동 칸 ===');
  out.filled.forEach((z) => console.log(`  ${z.id} = "${z.val}"`));
  console.log('\n=== 빈 B동 칸 ===');
  console.log(' ', out.empty.join('\n  '));
  // 이유정리함이 B동 어디 있나
  const allVals = out.filled.map((z) => ({ id: z.id, val: z.val }));
  console.log('\n=== 이유정리함 제품 위치 (B동 내) ===');
  for (const pn of ['642','643','647','648','649','650','689','690','691','692','693','694','695','696','697','698','699','2145','2146']) {
    const hit = allVals.filter((z) => z.val.split(',').includes(pn));
    if (hit.length) console.log(`  ${pn}: ${hit.map((h) => h.id).join(', ')}`);
    else console.log(`  ${pn}: (B동에 없음)`);
  }
});
