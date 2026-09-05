import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = '/home/comage/vf-project/VF-new/공유/화면실측-20260904';

async function grabAmber(page: any) {
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      const col = st.color;
      const txt = (el.textContent || '').trim();
      return /rgb\(217, 119, 6\)|#d97706|amber/.test(col + (el.className || '')) && /^[\d→,]+$/.test(txt) && txt.length <= 15 && st.fontWeight === '700';
    });
    return [...new Set(els.map((e) => (e.textContent || '').trim()))].sort();
  });
}

test('총괄 vs A동 단독 — amber 번호 집합 비교 (5db2a07 검증)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/product-display', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const btns = page.locator('button');
  const click = async (label: string) => {
    for (let i = 0; i < (await btns.count()); i++) {
      if (((await btns.nth(i).textContent()) || '').trim() === label) { await btns.nth(i).click(); return true; }
    }
    return false;
  };

  await click('총괄');
  const whole = await grabAmber(page);
  console.log('총괄 amber 번호 수:', whole.length);
  await page.screenshot({ path: path.join(OUT, '5db2a07-총괄.png') });

  await click('A동');
  const a = await grabAmber(page);
  console.log('A동 amber 번호 수:', a.length);
  await page.screenshot({ path: path.join(OUT, '5db2a07-ADong.png') });

  const wS = new Set(whole), aS = new Set(a);
  const onlyW = whole.filter((x) => !aS.has(x));
  const onlyA = a.filter((x) => !wS.has(x));
  console.log('\n총괄에만 있는 번호:', onlyW.length ? onlyW : '없음 ✅');
  console.log('A동에만 있는 번호:', onlyA.length ? onlyA : '없음 ✅');
  console.log('\n판정:', onlyW.length === 0 && onlyA.length === 0 ? '두 뷰 번호 집합 완전 일치 ✅' : '불일치 ❌');
  fs.writeFileSync(path.join(OUT, '5db2a07-비교.json'), JSON.stringify({ whole, a, onlyW, onlyA }, null, 1));
});
