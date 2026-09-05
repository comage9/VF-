import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 배치 레이아웃 전체 덤프', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const dump = await page.evaluate(() => {
    const raw = localStorage.getItem('vf_product_display_layout_v1');
    if (!raw) return { error: 'layout 없음' };
    const L = JSON.parse(raw);
    // 구조 파악
    const shape = Array.isArray(L) ? `array[${L.length}]` : typeof L;
    // A동이거나 B동인 항목만 추출
    function flatten(node, out = [], dongPrefix = '') {
      if (node && typeof node === 'object') {
        if (Array.isArray(node.zones)) {
          const zs = node.zones.filter((z) => z && z.id && String(z.id).startsWith('B'));
          if (zs.length) out.push({ key: node.key || dongPrefix, dong: 'B', zoneCount: zs.length, zones: zs });
        }
        for (const k of Object.keys(node)) flatten(node[k], out, dongPrefix);
      }
      return out;
    }
    const bLayers = flatten(L);
    return {
      shape,
      rawLen: raw.length,
      bLayers: bLayers.map((l) => ({ key: l.key, zoneCount: l.zoneCount })),
      keys: Array.isArray(L) ? L.map((x) => x && x.key) : Object.keys(L),
      // 첫 B 레이어 zones를 샘플로
      bZonesSample: bLayers[0] ? bLayers[0].zones.slice(0, 5) : null,
      allB: bLayers.length ? bLayers.flatMap((l) => l.zones) : [],
    };
  });

  if (dump.allB) {
    const zones = dump.allB;
    console.log('B동 존 수:', zones.length);
    const placed = zones.filter((z) => z.data && z.data.length > 0);
    const empty = zones.filter((z) => !z.data || z.data.length === 0);
    console.log('배치 칸:', placed.length, '| 빈 칸:', empty.length);
    console.log('\n=== 배치된 칸 (id, data) ===');
    placed.forEach((z) => console.log(`  ${z.id}: [${(z.data || []).join(',')}] locNo=${z.locNo ?? (z.locNos ? JSON.stringify(z.locNos) : '-')}`));
    console.log('\n=== 빈 칸 id 목록 ===');
    empty.forEach((z) => console.log(' ', z.id));
    fs.writeFileSync(path.join(OUT, 'B동-layout-덤프.json'), JSON.stringify({ placed: placed.map((z) => ({ id: z.id, data: z.data, locNo: z.locNo, locNos: z.locNos })), empty: empty.map((z) => z.id) }, null, 1));
  } else {
    console.log('B동 레이어 없음', JSON.stringify(dump).slice(0, 500));
  }
  console.log('layout shape:', dump.shape, '| B레이어:', JSON.stringify(dump.bLayers));
});
