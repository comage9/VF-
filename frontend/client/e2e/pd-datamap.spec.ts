import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
// "이유 정리함" 마스터 제품번호
const REASON = [642, 643, 647, 648, 649, 691, 694, 696, 698, 692, 689, 697, 699, 650, 693, 695, 690, 2145, 2146];

test('전 동 배치 데이터 맵 덤프 + 이유정리함 위치', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const dump = await page.evaluate(() => {
    // 모든 localStorage 키에서 데이터 맵 찾기
    const out = { keys: Object.keys(localStorage), dataLayers: {} };
    for (const key of Object.keys(localStorage)) {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length < 50) continue;
      try {
        const v = JSON.parse(raw);
        // v.data 가 맵이거나, { __v, data } 형태
        let dataMap = null;
        if (v && typeof v === 'object' && v.data && typeof v.data === 'object' && !Array.isArray(v.data)) dataMap = v.data;
        else if (v && typeof v === 'object' && !Array.isArray(v)) dataMap = v;
        if (dataMap) {
          const entries = Object.entries(dataMap);
          const bEntries = entries.filter(([k]) => String(k).startsWith('B') || /^B-/.test(String(k)));
          out.dataLayers[key] = { total: entries.length, bCount: bEntries.length, bSample: bEntries.slice(0, 5) };
        }
      } catch { }
    }
    return out;
  });
  fs.writeFileSync(path.join(OUT, '전체-data맵.json'), JSON.stringify(dump, null, 1));
  console.log('localStorage 키:', dump.keys);
  for (const [k, v] of Object.entries(dump.dataLayers)) console.log(k, '->', JSON.stringify(v).slice(0, 400));
});
