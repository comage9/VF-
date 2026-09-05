import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// 총괄 뷰 vs A동 단독 뷰 — 로케이션 번호 표시 차이 실측 비교 (2026-09-04)
const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

async function collect(page: any) {
  await page.waitForTimeout(2200);
  const data = await page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
    // ① 로케이션 번호 라벨: 순수 숫자(1~3자리) 또는 N→N 화살표 요약
    const locNos: string[] = [];
    for (const l of body) {
      if (/^\d{1,3}$/.test(l) || /^\d{1,3}→\d{1,3}$/.test(l)) locNos.push(l);
    }
    // ② 좌표 라벨: X숫자/Y숫자 또는 X n, Y n 형태
    const coords = body.filter((l) => /^X\s?\d+[,\s/]\s*Y/i.test(l) || /^X\d+$|^Y\d+$/i.test(l) || /^[XY]\s?\d+$/i.test(l));
    // ③ A동 영역 표식(메뉴/타이틀)
    const dongInfo = body.filter((l) => /동$/.test(l) && l.length <= 8).slice(0, 10);
    return { locNos: locNos.slice(0, 200), coordCount: coords.length, coords: coords.slice(0, 25), dongInfo };
  });
  // 중복 유지 전체 개수 + 고유 개수
  const uniq = new Set(data.locNos);
  return { ...data, locTotal: data.locNos.length, locUnique: uniq.size };
}

test('총괄 vs A동 로케이션 표시 비교', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btn = (t: string) => page.locator(`button:has-text("${t}")`).first();

  // 총괄
  await btn('총괄').click().catch(() => {});
  const whole = await collect(page);
  fs.writeFileSync(path.join(OUT, '비교-총괄.json'), JSON.stringify(whole, null, 1));
  await page.screenshot({ path: path.join(OUT, '비교-총괄.png') });

  // A동 단독
  await btn('A동').click().catch(() => {});
  const a = await collect(page);
  fs.writeFileSync(path.join(OUT, '비교-ADong.json'), JSON.stringify(a, null, 1));
  await page.screenshot({ path: path.join(OUT, '비교-ADong.png') });

  // 비교 출력
  const setW = new Set(whole.locNos), setA = new Set(a.locNos);
  const onlyW = [...setW].filter((x) => !setA.has(x));
  const onlyA = [...setA].filter((x) => !setW.has(x));
  console.log('총괄: 로케이션 라벨', whole.locTotal, '(고유', whole.locUnique + ') | 좌표표기', whole.coordCount, '| 동 표식:', whole.dongInfo.length);
  console.log('A동 : 로케이션 라벨', a.locTotal, '(고유', a.locUnique + ') | 좌표표기', a.coordCount, '| 동 표식:', a.dongInfo.length);
  console.log('총괄에만 있는 번호(일부):', onlyW.slice(0, 40));
  console.log('A동에만 있는 번호(일부):', onlyA.slice(0, 40));
  console.log('총괄 좌표 라벨 예:', whole.coords.slice(0, 8));
  console.log('A동 좌표 라벨 예:', a.coords.slice(0, 8));
  expect(fs.existsSync(path.join(OUT, '비교-총괄.png'))).toBeTruthy();
});
