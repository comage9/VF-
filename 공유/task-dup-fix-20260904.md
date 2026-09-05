# 구현 지시서: 다품목 구획 단일 번호 반복 표시 제거 (중복 렌더 해소)

> 아래 편집을 적용하라. 동일 앵커가 파일 내 **2곳**(가로 배치 블록·세로 배치 블록)에 있으므로 **둘 다** 교체한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: DOM 실측에서 A동 단독 뷰의 일부 번호가 3~4개 중복 렌더(75×3·127×4 등) 확인.
> 원인: 다품목 칸에 번호가 1개뿐일 때(locNos.length===1) 구획(compartment)마다 같은 번호를 반복 표시.
> 좌표 기준 오버레이가 이미 칸당 1번 표시하므로 구획 반복은 제거한다.

## Edit — 다품목 구획 번호 조건 변경 (2곳 모두)

앵커(정확 일치 — 2곳 존재):
```
                  {locNos && (locNos.length === 1 ? locNos[0] : locNos[i]) != null && (
                    <span className="text-[6px] leading-none font-mono font-bold text-amber-600 mt-px">
                      {locNos.length === 1 ? locNos[0] : locNos[i]}
                    </span>
                  )}
```
교체(2곳 모두 동일):
```
                  {locNos && locNos.length > 1 && locNos[i] != null && (
                    <span className="text-[6px] leading-none font-mono font-bold text-amber-600 mt-px">
                      {locNos[i]}
                    </span>
                  )}
```

## 금지 사항

- 좌표 기준 오버레이(gridLabels)·coordNosByZone **수정 금지**
- 단일 품목 칸 표기(오버레이) **수정 금지**
- MiniZoneCell·MobileListView **수정 금지**
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "locNos.length === 1 ? locNos\[0\]" frontend/client/src/pages/product-display.tsx` → 0
4. 변경 요약 출력
