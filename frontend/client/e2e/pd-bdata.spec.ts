import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('STORAGE_KEY data 맵에서 B동 배치 확인', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const result = { keys, candidates: {} };
    // vf_product_display_v1 류(data 보관)와 layout 류 구분
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const v = JSON.parse(raw);
        const dataMap = (v && typeof v === 'object' && v.data && typeof v.data === 'object' && !Array.isArray(v.data)) ? v.data : null;
        if (dataMap) {
          const bEntries = Object.entries(dataMap).filter(([k]) => String(k).startsWith('B'));
          const filled = bEntries.filter(([, val]) => String(val).trim().length > 0);
          result.candidates[key] = { ver: v.__v, total: Object.keys(dataMap).length, bCount: bEntries.length, bFilled: filled.length, sample: filled.slice(0, 8) };
        }
      } catch {}
    }
    return result;
  });
  fs.writeFileSync(path.join(OUT, 'data맵-B동.json'), JSON.stringify(out, null, 1));
  console.log('localStorage 키:', out.keys);
  for (const [k, v] of Object.entries(out.candidates)) {
    console.log(`\n[${k}] ver=${v.ver} total=${v.total} B배치=${v.bFilled}/${v.bCount}`);
    v.sample.forEach(([zid, val]) => console.log(`   ${zid} = "${val}"`));
  }
});
