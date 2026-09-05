# 구현 지시서: 총괄/A동 표시 불일치 해소 — 구획별 개별 번호 렌더 제거

> 아래 편집을 적용하라. 동일 앵커가 파일 내 **2곳**(가로 배치 블록·세로 배치 블록)에 있으므로 **둘 다** 제거한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: DOM 실측(2026-09-04) 확정 — A동 단독 뷰에서만 다품목 칸의 구획별 개별 번호(108~119·136~141 등 16개)가 좌표 기준 오버레이(범위 요약 "108→109")와 **이중 렌더**되어 총괄과 표시 내용이 다름. 구획별 번호는 제품 배치 수에 의존해 "일부만 보이거나 안 보이는" 현상의 원인.
> 원칙: 로케이션 번호는 **좌표 기준 오버레이 1벌**(칸당 범위 요약 1개)로 단일 렌더 — 두 뷰가 동일하게 표시된다.

## Edit — ZoneCell 구획별 개별 번호 표시 제거 (2곳 모두)

앵커(정확 일치 — 2곳 존재):
```
                  {locNos && locNos.length > 1 && locNos[i] != null && (
                    <span className="text-[6px] leading-none font-mono font-bold text-amber-600 mt-px">
                      {locNos[i]}
                    </span>
                  )}
```
처리: **두 블록 모두 전체 삭제** (교체 텍스트 없음 — 라인 자체를 제거).

## 금지 사항

- 좌표 기준 오버레이(gridLabels·A_COORD_NOS) **수정 금지**
- MiniZoneCell·MobileListView **수정 금지**
- locNos prop 자체는 유지 (타입 시그니처 변경 금지 — 추후 사용 대비)
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "locNos.length > 1 && locNos\[i\] != null" frontend/client/src/pages/product-display.tsx` → 0
4. `npx playwright test --config=playwright.evidence.config.ts e2e/dom-verify.spec.ts` 실행 후 결과 요약 출력 — 기대: 총괄/A동 라벨 수가 동일해지고(약 120개), 108~119·136~141 개별 번호가 A동에서도 사라져 두 뷰 번호 집합이 동일
