import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
const URL = 'http://localhost:5174/product-display';

async function dumpText(page: any) {
  return await page.evaluate(() => {
    const body = document.body.innerText || '';
    return body.split('\n').map((s: string) => s.trim()).filter(Boolean);
  });
}

test('직접 화면 검증 — 강제 새로고침 + 총괄/A동 전환', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  // 강제 새로고침 (캐시 무시)
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // ===== 총괄 화면 =====
  const btn = (t: string) => page.locator(`button:has-text("${t}")`).first();
  await btn('총괄').click().catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '직접검증-총괄.png'), fullPage: false });
  const totalLines = await dumpText(page);

  // ===== A동 단독 화면 =====
  await btn('A동').click().catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '직접검증-A동.png'), fullPage: false });
  const adongLines = await dumpText(page);

  // ===== B동 화면 (배율 220% 확인용) =====
  await btn('B동').click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '직접검증-B동.png'), fullPage: false });

  // ===== C동 화면 (배율 130%) =====
  await btn('C동').click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '직접검증-C동.png'), fullPage: false });

  // ===== D동 화면 (배율 220%) =====
  await btn('D동').click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '직접검증-D동.png'), fullPage: false });

  // ===== A동으로 돌아가서 줌 배율 확인 =====
  await btn('A동').click().catch(() => {});
  await page.waitForTimeout(2000);
  const zoomText = await page.locator('text=/\\d+%/').first().textContent().catch(() => 'N/A');
  console.log('A동 기본 배율 표시:', zoomText);

  // ===== 총괄으로 돌아가서 줌 배율 확인 =====
  await btn('총괄').click().catch(() => {});
  await page.waitForTimeout(2000);

  // 결과 저장
  fs.writeFileSync(path.join(OUT, '직접검증-텍스트.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    zoomA: zoomText,
    totalLinesCount: totalLines.length,
    adongLinesCount: adongLines.length,
  }, null, 1));

  console.log('=== 총괄 텍스트 라인 수:', totalLines.length);
  console.log('=== A동 텍스트 라인 수:', adongLines.length);
  console.log('=== 캡처 완료: 직접검증-*.png 5장');
});
