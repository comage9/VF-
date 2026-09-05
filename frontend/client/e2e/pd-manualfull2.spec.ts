import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';
const MKEY = 'vf_pd_manual_loc_nos_v1';

test('fd2d629 재검증 — MANUAL_LOC_KEY 기준', async ({ page }) => {
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
  await cell.click();
  await page.waitForTimeout(500);
  const locInput = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  console.log('A-L4-12 로케이션 input:', await locInput.count());

  // 현재 A-L4-12 data와 자동 시작번호 파악
  const before = await page.evaluate((zid) => {
    const data = JSON.parse(localStorage.getItem('vf_product_display_v1') || '{}').data || {};
    const manual = JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}');
    return { data: data[zid] || '', manual };
  }, zid);
  console.log('현재 data[zid]:', before.data, '| manual:', JSON.stringify(before.manual));
  res.before = before;

  // ① 정상 값 200 입력
  await locInput.fill('200');
  await locInput.press('Enter');
  await page.waitForTimeout(1200);

  // 편집 종료 후 화면 전체 amber + manual 키
  const after = await page.evaluate((zid) => {
    const manual = JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}');
    const amber = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt) || st.position !== 'absolute') return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
    }).map((el) => (el.textContent || '').trim());
    const nums = amber.flatMap((t) => { const p = t.split('→').map(Number); return p.length > 1 ? Array.from({ length: p[1] - p[0] + 1 }, (_, i) => p[0] + i) : p; }).sort((a, b) => a - b);
    const cz = document.querySelector(`[data-zone-id="${zid}"]`)?.getBoundingClientRect();
    const inCell = cz ? amber.filter(() => true) : [];
    void inCell;
    return { manual, min: nums[0], max: nums[nums.length - 1], count: nums.length, has200: nums.includes(200), amberSample: amber.slice(0, 3) };
  }, zid);
  res.step1 = after;
  console.log('200 입력 → manual:', JSON.stringify(after.manual), '| has200:', after.has200, '| 범위:', after.min, '~', after.max);
  await page.screenshot({ path: path.join(OUT, 'manual-200b.png'), fullPage: false });

  // ② 앞번호 미만 5 입력 → 거부 확인
  await cell.click();
  await page.waitForTimeout(400);
  const locInput2 = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  await locInput2.fill('5');
  await locInput2.press('Enter');
  await page.waitForTimeout(600);
  const step2 = await page.evaluate((zid) => {
    const manual = JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}');
    const bodyText = document.body.innerText;
    const warn = bodyText.includes('앞번호') ? (bodyText.match(/앞번호\(\d+\)보다 작은 값\(\d+\)[^\n]*/) || [''])[0] : '';
    return { manual: manual[zid], warn };
  }, zid);
  res.step2 = step2;
  console.log('5 입력 → manual[zid]:', step2.manual, '| 경고:', JSON.stringify(step2.warn));
  await page.screenshot({ path: path.join(OUT, 'manual-5b.png'), fullPage: false });

  // ③ 정리 — 수동 값 제거(자동 복귀)
  await cell.click();
  await page.waitForTimeout(400);
  const locInput3 = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  if (await locInput3.count()) {
    await locInput3.fill('');
    await locInput3.press('Enter');
    await page.waitForTimeout(600);
  }
  const cleanup = await page.evaluate(() => JSON.parse(localStorage.getItem('vf_pd_manual_loc_nos_v1') || '{}'));
  res.cleanup = cleanup;
  console.log('정리 후 manual:', JSON.stringify(cleanup));

  fs.writeFileSync(path.join(OUT, 'fd2d629-수동검증2.json'), JSON.stringify(res, null, 1));
});
