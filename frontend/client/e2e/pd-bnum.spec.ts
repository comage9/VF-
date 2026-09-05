import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('B동 배치(num) 전체 덤프 + 미배치 이유정리함', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const data = await page.evaluate(async () => {
    const raw = localStorage.getItem('vf_product_display_layout_v1');
    if (!raw) return { error: 'layout 없음' };
    const L = JSON.parse(raw);
    function findBZones(node, depth = 0) {
      if (!node || typeof node !== 'object' || depth > 5) return null;
      if (Array.isArray(node)) { for (const x of node) { const r = findBZones(x, depth + 1); if (r) return r; } return null; }
      for (const [k, v] of Object.entries(node)) {
        if (k === 'zones' && Array.isArray(v)) {
          const zs = v.filter((z) => z && z.id && String(z.id).startsWith('B'));
          if (zs.length) return zs;
        }
        const r = findBZones(v, depth + 1); if (r) return r;
      }
      return null;
    }
    const zones = findBZones(L) || [];
    const placed = zones.filter((z) => z.num && String(z.num).trim().length > 0);
    const empty = zones.filter((z) => !z.num || String(z.num).trim().length === 0);
    return {
      zoneCount: zones.length,
      placed: placed.map((z) => ({ id: z.id, num: z.num, fixed: z.fixed })),
      empty: empty.map((z) => ({ id: z.id, fixed: z.fixed })),
    };
  });
  fs.writeFileSync(path.join(OUT, 'B동-num-덤프.json'), JSON.stringify(data, null, 1));
  console.log('B동 존:', data.zoneCount, '| 배치:', data.placed.length, '| 빈칸:', data.empty.length);
  console.log('\n=== 배치 칸 ==='); data.placed.forEach((z) => console.log(`  ${z.id}: num="${z.num}"${z.fixed ? ' 🔒' : ''}`));
  console.log('\n=== 빈 칸 ==='); data.empty.forEach((z) => console.log(`  ${z.id}${z.fixed ? ' 🔒' : ''}`));
});
