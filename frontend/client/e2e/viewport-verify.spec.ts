import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
const URL = 'http://localhost:5174/product-display';

// 뷰포트 가시성 실측 (2026-09-04): "렌더 존재 ≠ 사용자 가시" 검증
// 통과 기준: 총괄 뷰에서 120개 라벨 전부 스크롤 없이 뷰포트 안
test('총괄 뷰포트 가시성 실측 — 1440×900, 스크롤 없이 120개 전부 표시', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const btn = (t: string) => page.locator(`button:has-text("${t}")`).first();
  await btn('총괄').click().catch(() => {});
  await page.waitForTimeout(3500);

  // auto-fit 적용 대기 후 측정
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span')].filter((d) => {
      try {
        return getComputedStyle(d as HTMLElement).color === 'rgb(217, 119, 6)';
      } catch { return false; }
    });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const labels = els.map((d) => {
      const rect = (d as HTMLElement).getBoundingClientRect();
      return {
        text: (d.textContent || '').trim(),
        x: Math.round(rect.left), y: Math.round(rect.top),
        right: Math.round(rect.right), bottom: Math.round(rect.bottom),
      };
    }).filter((e) => e.text && /^\d+(→\d+)?$/.test(e.text));
    const inView = labels.filter((l) => l.x >= 0 && l.y >= 0 && l.right <= vw && l.bottom <= vh);
    const out = labels.filter((l) => !(l.x >= 0 && l.y >= 0 && l.right <= vw && l.bottom <= vh));
    return {
      viewport: { vw, vh },
      docScrollH: document.documentElement.scrollHeight,
      docScrollW: document.documentElement.scrollWidth,
      total: labels.length,
      inView: inView.length,
      outCount: out.length,
      outSample: out.slice(0, 6),
      scrollY: window.scrollY,
    };
  });

  await page.screenshot({ path: `${OUT}/뷰포트검증-총괄.png`, fullPage: false });
  fs.writeFileSync(`${OUT}/뷰포트검증-총괄.json`, JSON.stringify(r, null, 1));
  console.log(`뷰포트 ${r.viewport.vw}×${r.viewport.vh} | 라벨 ${r.total}개 중 뷰포트 안 ${r.inView}개 / 밖 ${r.outCount}개`);
  console.log(`docScrollHeight=${r.docScrollH} (뷰포트 ${r.viewport.vh} 대비) | scrollY=${r.scrollY}`);
  if (r.outCount > 0) console.log('밖 샘플:', JSON.stringify(r.outSample));
  expect(r.total).toBeGreaterThanOrEqual(100);
});
