# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production-plan-dnd.spec.ts >> 생산계획 DnD 테스트 >> 행에 드래그 핸들(그립)이 존재함
- Location: e2e/production-plan-dnd.spec.ts:23:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 1
Received:   1
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "VF 보노하우스" [level=1] [ref=e7]
        - paragraph [ref=e8]: 실시간 생산 인사이트
      - generic [ref=e9]:
        - link " 출고 현황" [ref=e10] [cursor=pointer]:
          - /url: /delivery
          - generic [ref=e11]: 
          - generic [ref=e12]: 출고 현황
        - link " 출고 수량" [ref=e13] [cursor=pointer]:
          - /url: /outbound
          - generic [ref=e14]: 
          - generic [ref=e15]: 출고 수량
        - link " 전산 재고 수량" [ref=e16] [cursor=pointer]:
          - /url: /inventory/enhanced
          - generic [ref=e17]: 
          - generic [ref=e18]: 전산 재고 수량
        - link " 생산 계획 " [ref=e19] [cursor=pointer]:
          - /url: /production
          - generic [ref=e20]: 
          - generic [ref=e21]: 생산 계획
          - generic [ref=e22]: 
        - link " 모바일 생산" [ref=e23] [cursor=pointer]:
          - /url: /production-app
          - generic [ref=e24]: 
          - generic [ref=e25]: 모바일 생산
        - link " 제품 마스터 관리" [ref=e26] [cursor=pointer]:
          - /url: /master
          - generic [ref=e27]: 
          - generic [ref=e28]: 제품 마스터 관리
    - generic [ref=e29]:
      - generic [ref=e30]:
        - generic [ref=e32]:
          - heading "생산 계획 모니터링" [level=2] [ref=e33]
          - paragraph [ref=e34]: 생산 라인·품목별 진행 상황과 작업량을 실시간으로 추적합니다.
        - generic [ref=e36]:
          - generic [ref=e37]: 
          - generic [ref=e38]: "마지막 갱신: 2026. 04. 11. 오후 04:37"
      - generic [ref=e40]:
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]:
              - generic [ref=e44]: 날짜 선택
              - combobox "날짜 선택" [ref=e45] [cursor=pointer]:
                - generic: 최신 날짜 (2026-04-10)
                - img [ref=e46]
            - generic [ref=e48]:
              - generic [ref=e49]: 기계번호
              - combobox "기계번호" [ref=e50] [cursor=pointer]:
                - generic: 전체
                - img [ref=e51]
            - generic [ref=e53]:
              - generic [ref=e54]: 검색
              - textbox "검색" [ref=e55]:
                - /placeholder: 품목명, 색상명 등
          - generic [ref=e56]:
            - button "양식" [ref=e57] [cursor=pointer]:
              - img
              - text: 양식
            - button "업로드" [ref=e58] [cursor=pointer]:
              - img
              - text: 업로드
            - button "신규" [ref=e59] [cursor=pointer]:
              - img
              - text: 신규
            - button "일자 삭제" [disabled]:
              - img
              - text: 일자 삭제
            - generic [ref=e60]:
              - combobox [ref=e61] [cursor=pointer]:
                - generic: 대기
                - img [ref=e62]
              - button "선택 상태 변경" [disabled]
              - button "일자 상태 변경" [disabled]
              - button "전체 상태 변경" [ref=e64] [cursor=pointer]
        - generic [ref=e65]:
          - generic [ref=e68]:
            - generic [ref=e69]:
              - paragraph [ref=e70]: 총 수량
              - heading "0" [level=3] [ref=e71]
              - paragraph [ref=e72]: 전체 생산 수량
            - img [ref=e73]
          - generic [ref=e79]:
            - generic [ref=e80]:
              - paragraph [ref=e81]: 총 단위수량
              - heading "0" [level=3] [ref=e82]
              - paragraph [ref=e83]: 누적 단위 생산
            - img [ref=e84]
          - generic [ref=e88]:
            - generic [ref=e89]:
              - paragraph [ref=e90]: 총 레코드
              - heading "0" [level=3] [ref=e91]
              - paragraph [ref=e92]: 생산 계획 수
            - img [ref=e93]
          - generic [ref=e98]:
            - generic [ref=e99]:
              - paragraph [ref=e100]: 총 생산량
              - heading "0" [level=3] [ref=e101]
              - paragraph [ref=e102]: 전체 생산 완료
            - img [ref=e103]
        - generic [ref=e106]:
          - table [ref=e108]:
            - rowgroup [ref=e109]:
              - row "상태 일자 기계 금형 제품명 색상 단위 생산수량 총계 작업" [ref=e110]:
                - columnheader [ref=e111]:
                  - checkbox [ref=e112] [cursor=pointer]
                - columnheader "상태" [ref=e113]
                - columnheader "일자" [ref=e114]
                - columnheader "기계" [ref=e115]
                - columnheader "금형" [ref=e116]
                - columnheader "제품명" [ref=e117]
                - columnheader "색상" [ref=e118]
                - columnheader "단위" [ref=e119]
                - columnheader "생산수량" [ref=e120]
                - columnheader "총계" [ref=e121]
                - columnheader "작업" [ref=e122]
            - rowgroup [ref=e123]:
              - row "데이터가 없습니다." [ref=e124]:
                - cell "데이터가 없습니다." [ref=e125]
          - status [ref=e126]
      - button "AI 챗봇 열기" [ref=e127] [cursor=pointer]:
        - img [ref=e128]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('생산계획 DnD 테스트', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/production');
  6  |     // 테이블 헤더의 "기계" 텍스트가 보일 때까지 대기
  7  |     await page.waitForSelector('text=기계', { timeout: 10000 });
  8  |     // 데이터 행이 로드될 때까지 추가 대기
  9  |     await page.waitForTimeout(1000);
  10 |   });
  11 | 
  12 |   test('페이지가 정상 로드됨', async ({ page }) => {
  13 |     await expect(page.locator('h2:has-text("생산 계획 모니터링")')).toBeVisible();
  14 |     await expect(page.locator('table')).toBeVisible();
  15 |   });
  16 | 
  17 |   test('기계 그룹 헤더가 표시됨', async ({ page }) => {
  18 |     const headers = page.locator('tr:has-text("기계번호:")');
  19 |     const count = await headers.count();
  20 |     expect(count).toBeGreaterThan(0);
  21 |   });
  22 | 
  23 |   test('행에 드래그 핸들(그립)이 존재함', async ({ page }) => {
  24 |     // 모든 버튼 개수 확인 (드래그 핸들 버튼)
  25 |     const allButtons = page.locator('table button');
  26 |     const count = await allButtons.count();
> 27 |     expect(count).toBeGreaterThan(1);
     |                   ^ Error: expect(received).toBeGreaterThan(expected)
  28 |   });
  29 | 
  30 |   test('첫 번째 데이터 행의 드래그 버튼 위치 확인', async ({ page }) => {
  31 |     // 테이블 tbody 내 첫 번째 데이터 행의 버튼
  32 |     const firstDataRow = page.locator('tbody tr').nth(1); // 0은 헤더행, 1부터 데이터
  33 |     const buttons = firstDataRow.locator('button');
  34 |     const count = await buttons.count();
  35 |     expect(count).toBeGreaterThan(0);
  36 |   });
  37 | 
  38 |   test('체크박스가 존재함', async ({ page }) => {
  39 |     const checkboxes = page.locator('[role="checkbox"]');
  40 |     const count = await checkboxes.count();
  41 |     expect(count).toBeGreaterThan(0);
  42 |   });
  43 | 
  44 |   test('체크박스 선택 가능함', async ({ page }) => {
  45 |     const firstCheckbox = page.locator('[role="checkbox"]').first();
  46 |     // force: true needed because checkbox is visually hidden (peer pattern)
  47 |     await firstCheckbox.click({ force: true });
  48 |     // 체크 상태 확인
  49 |     const isChecked = await firstCheckbox.getAttribute('aria-checked');
  50 |     expect(isChecked).toBe('true');
  51 |   });
  52 | });
  53 | 
```