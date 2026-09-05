import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('fd2d629 경고 메시지 표시 확인', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(1500);
  const editBtn = page.getByRole('button', { name: '수정', exact: true }).first();
  if (await editBtn.count()) await editBtn.click();
  await page.waitForTimeout(800);

  const res: any = {};
  const zid = 'A-L4-12';
  const cell = page.locator(`[data-zone-id="${zid}"]`).first();

  // 먼저 정상 값 설정 (이전 테스트에서 정리됐을 수 있으니 다시 200)
  await cell.click();
  await page.waitForTimeout(400);
  let li = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  await li.fill('200');
  await li.press('Enter');
  await page.waitForTimeout(800);

  // 저장 메시지(✅) 확인
  const okMsg = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')].filter((s) => (s.textContent || '').includes('저장'));
    return spans.map((s) => (s.textContent || '').trim()).slice(0, 3);
  });
  res.okMsg = okMsg;
  console.log('✅ 저장 메시지:', JSON.stringify(okMsg));

  // 5 입력 → 거부 경고
  await cell.click();
  await page.waitForTimeout(400);
  li = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  console.log('input 재등장:', await li.count());
  await li.fill('5');
  await li.press('Enter');
  // 경고는 3초 유지 — 즉시 span/텍스트 스캔 (여러 번)
  for (let t = 0; t < 4; t++) {
    await page.waitForTimeout(400);
    const warn = await page.evaluate(() => {
      const all = [...document.querySelectorAll('span, div, p')].map((s) => (s.textContent || '').trim()).filter((x) => x.includes('앞번호'));
      return all.slice(0, 2);
    });
    if (warn.length) { res.warn = warn; console.log('⚠️ 경고 텍스트:', JSON.stringify(warn)); break; }
    if (t === 3) { res.warn = '(미발견)'; console.log('⚠️ 경고 미발견'); }
  }
  const manual = await page.evaluate((zid) => JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}')[zid] ?? null, zid);
  res.manual = manual;
  console.log('manual[zid] 유지 확인:', manual);

  // 정리 — 자동 모드 복귀
  await cell.click();
  await page.waitForTimeout(400);
  li = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  await li.fill('');
  await li.press('Enter');
  await page.waitForTimeout(500);
  const clean = await page.evaluate(() => JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}'));
  res.clean = clean;
  console.log('정리:', JSON.stringify(clean));

  fs.writeFileSync(path.join(OUT, 'fd2d629-경고확인.json'), JSON.stringify(res, null, 1));
});
