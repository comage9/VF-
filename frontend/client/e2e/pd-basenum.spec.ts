import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260905';
const MANUAL_KEY = 'vf_pd_manual_loc_nos_v1';
const STORE_KEY = 'vf_product_display_v1';

test('수동 입력 편집 시 기본 배정 번호 표시 — placeholder 실측 (2026-09-05)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // A동 탭
  const btns = page.locator('button');
  let aClicked = false;
  for (let i = 0; i < (await btns.count()); i++) {
    if (((await btns.nth(i).textContent()) || '').trim() === 'A동') {
      await btns.nth(i).click();
      aClicked = true;
      break;
    }
  }
  await page.waitForTimeout(1500);
  console.log('A동 탭 클릭:', aClicked);

  // 로드된 상태(manual/data/zones) 파악 — manual 없는 A 칸을 대상으로 선택
  const st = await page.evaluate(({ MANUAL_KEY, STORE_KEY }) => {
    const manual = JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}');
    const data = (JSON.parse(localStorage.getItem(STORE_KEY) || '{}').data) || {};
    const zones = [...document.querySelectorAll('[data-zone-id]')]
      .map((el) => el.getAttribute('data-zone-id'))
      .filter((z): z is string => !!z && z.startsWith('A-'));
    return { manual, data, zones };
  }, { MANUAL_KEY, STORE_KEY });

  const manualZones = new Set(Object.keys(st.manual));
  const manualNone = st.zones.filter((z) => !manualZones.has(z));
  const withItems = manualNone.filter((z) => (st.data[z] || '').split(',').filter(Boolean).length > 0);
  const zid = withItems[0] || manualNone[0];
  const res: any = { target: zid, hasManualTarget: manualZones.has(zid), aClicked };

  console.log('대상 칸:', zid, '| data:', JSON.stringify(st.data[zid]), '| manual 전체:', JSON.stringify(st.manual));

  // 화면 캡처 가독성 위해 ＋ 확대 버튼 최대로
  const zoomBtn = page.locator('button[title="배치도 확대"]').first();
  for (let i = 0; i < 25; i++) {
    const label = await page.locator('span').filter({ hasText: /^\d+%$/ }).first().textContent().catch(() => null);
    if (label && label.trim() === '300%') break;
    if (await zoomBtn.count()) { await zoomBtn.click(); await page.waitForTimeout(60); }
  }
  await page.waitForTimeout(500);

  // 수정 모드 진입
  const editBtn = page.getByRole('button', { name: '수정', exact: true }).first();
  if (await editBtn.count()) await editBtn.click();
  await page.waitForTimeout(700);

  const cell = page.locator(`[data-zone-id="${zid}"]`).first();
  await cell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // §6-1) manual 없는 칸 편집 → 로케이션 input에 기본 번호 보이는지
  await cell.click();
  await page.waitForTimeout(600);
  const locInput = page.locator(`[data-zone-id="${zid}"] input`).nth(1); // A동 편집 박스: 0=제품 input, 1=로케이션 input
  const ph = await locInput.getAttribute('placeholder').catch(() => null);
  const val = await locInput.inputValue().catch(() => '');
  const rect = await cell.boundingBox();
  res.step1 = { zid, placeholder: ph, value: val, cellRect: rect };
  console.log(`§6-1 편집 열림 — placeholder="${ph}" value="${val}"`);

  // 근거리 캡처 (편집 박스 주변)
  if (rect) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const clipW = Math.max(420, rect.width * 4);
    const clipH = Math.max(300, rect.height * 4);
    await page.screenshot({
      path: path.join(OUT, 'basenum-step1-editing.png'),
      clip: { x: Math.max(0, cx - clipW / 2), y: Math.max(0, cy - clipH / 2), width: clipW, height: clipH },
    });
  }
  await page.screenshot({ path: path.join(OUT, 'basenum-step1-full.png') });

  // placeholder가 기본 번호인지 — 화면 amber 오버레이(실제 표시 번호)와 대조
  const amberNear = await page.evaluate((zid) => {
    const cellRect = document.querySelector(`[data-zone-id="${zid}"]`)?.getBoundingClientRect();
    if (!cellRect) return null;
    const ambers = [...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      if (!/^(\d+)(→\d+)?$/.test(txt)) return false;
      if (!/rgb\(217, 119, 6\)/.test(cs.color)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    const near = ambers
      .map((a) => ({ ...a, d: Math.hypot(a.cx - (cellRect.x + cellRect.width / 2), a.cy - (cellRect.y + cellRect.height / 2)) }))
      .sort((a, b) => a.d - b.d)[0];
    return near ? { txt: near.txt, dist: Math.round(near.d) } : null;
  }, zid);
  res.step1.amberNear = amberNear;
  console.log('화면 amber(실표시) 근접값:', JSON.stringify(amberNear));

  // Esc 취소 (변경 없음 — 서버/로컬 무영향)
  await locInput.press('Escape');
  await page.waitForTimeout(500);

  // §6-2) 그대로 비우고 저장 → 기존 자동 번호 유지 (회귀 없음)
  await cell.click();
  await page.waitForTimeout(500);
  const li2 = page.locator(`[data-zone-id="${zid}"] input`).nth(1);
  const val2 = await li2.inputValue().catch(() => '');
  const ph2 = await li2.getAttribute('placeholder').catch(() => null);
  await li2.fill('');
  await li2.press('Enter');
  await page.waitForTimeout(900);
  const afterAuto = await page.evaluate(({ zid, MANUAL_KEY }) => ({
    manualAtCell: (JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}'))[zid] ?? null,
  }), { zid, MANUAL_KEY });
  res.step2 = { beforeValue: val2, beforePlaceholder: ph2, afterManualAtCell: afterAuto.manualAtCell };
  console.log('§6-2 빈 값 저장 후 manual:', JSON.stringify(afterAuto), '(자동 유지 = null)');

  // §6-3) 새 값 입력 → manual로 변경 (기존 동작 유지)
  await cell.click();
  await page.waitForTimeout(500);
  const li3 = page.locator(`[data-zone-id="${zid}"] input`).nth(1);
  await li3.fill('200');
  await li3.press('Enter');
  await page.waitForTimeout(900);
  await cell.click();
  await page.waitForTimeout(500);
  const li4 = page.locator(`[data-zone-id="${zid}"] input`).nth(1);
  const val4 = await li4.inputValue().catch(() => '');
  const ph4 = await li4.getAttribute('placeholder').catch(() => null);
  const afterManual = await page.evaluate(({ zid, MANUAL_KEY }) => ({
    manualAtCell: (JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}'))[zid] ?? null,
  }), { zid, MANUAL_KEY });
  res.step3 = { valueShown: val4, placeholder: ph4, manualAtCell: afterManual.manualAtCell };
  console.log('§6-3 200 입력 → manual:', JSON.stringify(afterManual), '| 편집 재오픈 value:', JSON.stringify(val4));
  if (rect) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    await page.screenshot({
      path: path.join(OUT, 'basenum-step3-manual-filled.png'),
      clip: { x: Math.max(0, cx - 210), y: Math.max(0, cy - 150), width: 420, height: 300 },
    });
  }
  await li4.press('Escape');
  await page.waitForTimeout(400);

  // §6-4 정리 — manual 제거(자동 복귀) → 다시 기본 번호 placeholder
  await cell.click();
  await page.waitForTimeout(500);
  const li5 = page.locator(`[data-zone-id="${zid}"] input`).nth(1);
  await li5.fill('');
  await li5.press('Enter');
  await page.waitForTimeout(900);
  await cell.click();
  await page.waitForTimeout(500);
  const li6 = page.locator(`[data-zone-id="${zid}"] input`).nth(1);
  const ph6 = await li6.getAttribute('placeholder').catch(() => null);
  const val6 = await li6.inputValue().catch(() => '');
  const cleanup = await page.evaluate((MANUAL_KEY) => JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}'), MANUAL_KEY);
  res.step4 = { placeholderAfterCleanup: ph6, valueAfterCleanup: val6, manualAll: cleanup };
  console.log('§6-4 정리 후 placeholder:', JSON.stringify(ph6), '| manual 전체:', JSON.stringify(cleanup));

  fs.writeFileSync(path.join(OUT, 'basenum-기본번호표시-실측.json'), JSON.stringify(res, null, 1));
  console.log('실측 산출물 저장 완료');
});
