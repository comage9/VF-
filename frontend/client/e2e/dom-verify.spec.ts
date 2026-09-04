import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
const URL = 'http://localhost:5174/product-display';

// 화면에 렌더된 로케이션 번호 라벨(amber #d97706)을 전수 추출 — 텍스트 + 화면 중심좌표
async function extractAmberLabels(page: any) {
  return await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span')].filter((d) => {
      try {
        return getComputedStyle(d as HTMLElement).color === 'rgb(217, 119, 6)';
      } catch {
        return false;
      }
    });
    return els
      .map((d) => {
        const r = (d as HTMLElement).getBoundingClientRect();
        return {
          text: (d.textContent || '').trim(),
          x: Math.round((r.left + r.right) / 2),
          y: Math.round((r.top + r.bottom) / 2),
          w: Math.round(r.width),
        };
      })
      .filter((e) => e.text && /^\d+(→\d+)?$/.test(e.text));
  });
}

test('DOM 기반 카논 실측 — 강제 새로고침 + 전 동 배율 확인', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const btn = (t: string) => page.locator(`button:has-text("${t}")`).first();

  await btn('총괄').click().catch(() => {});
  await page.waitForTimeout(3000);
  const overview = await extractAmberLabels(page);

  await btn('A동').click().catch(() => {});
  await page.waitForTimeout(3000);
  const adong = await extractAmberLabels(page);
  const zoomA = await page.locator('span:has-text("%")').first().textContent().catch(() => 'N/A');

  const zooms: Record<string, string> = {};
  for (const d of ['B', 'C', 'D']) {
    await btn(d).click().catch(() => {});
    await page.waitForTimeout(1500);
    zooms[d] = (await page.locator('span:has-text("%")').first().textContent().catch(() => 'N/A')) || '';
  }

  fs.writeFileSync(`${OUT}/dom-검증.json`, JSON.stringify({ overview, adong, zoomA, zooms }, null, 1));
  console.log(`총괄 라벨: ${overview.length}개 | A동 라벨: ${adong.length}개 | 배율 A=${zoomA} B=${zooms.B} C=${zooms.C} D=${zooms.D}`);
});
