import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

test('fd2d629 검증 — 수동 입력 정상·앞번호 미만 거부', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  // A동 탭
  const btns = page.locator('button');
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') { await btns.nth(i).click(); break; }
  }
  await page.waitForTimeout(1500);

  // 수정 모드 진입
  const editBtn = page.getByRole('button', { name: '수정', exact: true }).first();
  console.log('수정 버튼:', await editBtn.count());
  if (await editBtn.count()) await editBtn.click();
  await page.waitForTimeout(800);

  const res: any = {};

  // A-L4-12 칸 클릭 → 편집 input
  const zid = 'A-L4-12';
  const cell = page.locator(`[data-zone-id="${zid}"]`).first();
  console.log('칸 존재:', await cell.count());
  await cell.click();
  await page.waitForTimeout(500);
  const locInput = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  const prodInput = page.locator(`[data-zone-id="${zid}"] input[placeholder="19,28"]`);
  res.inputCount = (await locInput.count()) + (await prodInput.count());
  console.log('편집 input: 제품', await prodInput.count(), '로케이션', await locInput.count());

  // ① 정상 값 200 입력
  if (await locInput.count()) {
    await locInput.fill('200');
    await locInput.press('Enter');
    await page.waitForTimeout(1200);
    const after = await page.evaluate((zid) => {
      const raw = localStorage.getItem('vf_product_display_v1');
      const snap = JSON.parse(localStorage.getItem('vf_product_display_layout_v1') || '{}');
      let manual = {};
      try { manual = (JSON.parse(localStorage.getItem('vf_product_display_v1') || '{}').manualLocNos) || {}; } catch { }
      // 전체 manualLocNos는 별도 키일 수도 — 페이지 상태 확인 위해 amber 스캔
      const amber = [...document.querySelectorAll('*')].filter((el) => {
        const st = getComputedStyle(el); const txt = (el.textContent || '').trim();
        if (!/^(\d+)(→\d+)?$/.test(txt) || st.position !== 'absolute') return false;
        const r = el.getBoundingClientRect();
        return r.width > 3 && r.height > 3 && /rgb\(217, 119, 6\)/.test(st.color);
      }).map((el) => { const r = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim(), x: Math.round(r.x), y: Math.round(r.y) }; });
      const cz = document.querySelector(`[data-zone-id="${zid}"]`)?.getBoundingClientRect();
      const inCell = cz ? amber.filter((a) => a.x >= cz.x - 3 && a.x <= cz.x + cz.width + 3 && a.y >= cz.y - 3 && a.y <= cz.y + cz.height + 3).map((a) => a.txt) : [];
      return { manual, inCell, amberCount: amber.length };
    }, zid);
    res.step1 = after;
    console.log('200 입력 후 manual:', JSON.stringify(after.manual), '| A-L4-12칸 amber:', after.inCell);
    await page.screenshot({ path: path.join(OUT, 'manual-200.png'), fullPage: false });
  }

  // ② 앞번호 미만 5 입력 → 거부 확인
  if (await locInput.count()) {
    await cell.click();
    await page.waitForTimeout(400);
    const locInput2 = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
    if (await locInput2.count()) {
      await locInput2.fill('5');
      await locInput2.press('Enter');
      await page.waitForTimeout(600);
      const msg = await page.evaluate(() => document.body.innerText.includes('앞번호') ? '앞번호 경고 표시됨' : '경고 없음');
      const manual2 = await page.evaluate((zid) => {
        try { return JSON.parse(localStorage.getItem('vf_product_display_v1') || '{}').manualLocNos || {}; } catch { return {}; }
      }, zid);
      res.step2 = { msg, manual: manual2 };
      console.log('5 입력 시도 →', msg, '| manual:', JSON.stringify(manual2));
      await page.screenshot({ path: path.join(OUT, 'manual-5-reject.png'), fullPage: false });
    }
  }

  // ③ 정리: 200 입력 제거(자동 복귀) — 원상 복구 위해
  await cell.click();
  await page.waitForTimeout(400);
  const locInput3 = page.locator(`[data-zone-id="${zid}"] input[placeholder="로케이션 첫 번호"]`);
  if (await locInput3.count()) {
    await locInput3.fill('');
    await locInput3.press('Enter');
    await page.waitForTimeout(600);
  }
  res.cleanup = await page.evaluate((zid) => {
    try { return JSON.parse(localStorage.getItem('vf_product_display_v1') || '{}').manualLocNos || {}; } catch { return {}; }
  }, zid);
  console.log('정리 후 manual:', JSON.stringify(res.cleanup));

  fs.writeFileSync(path.join(OUT, 'fd2d629-수동검증.json'), JSON.stringify(res, null, 1));
});
