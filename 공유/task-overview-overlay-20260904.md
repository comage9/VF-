# 구현 지시서: 총괄 미니맵에 좌표 오버레이 적용 — 두 뷰 렌더 완전 통일

> 아래 편집을 **정확히 그대로** 적용하라. 앵커(정확 일치)를 찾아 주어진 코드로 교체/삽입한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: Hermes 실측 확정 — 총괄(MiniZoneCell 칩, 존 기반)과 A동 단독(좌표 오버레이, 존 무관)이 렌더 구조부터 분리돼 표시 내용이 다름 (총괄에만 제품번호 혼재·L7 개별 표기, A동에만 빈 좌표 번호 등 21개). 해법: 총괄 미니맵에도 **단독 뷰와 동일한 좌표 기준 오버레이**를 렌더하고 존 기반 칩(A동)은 제거 — 두 뷰가 같은 소스(A_COORD_NOS)·같은 배치가 된다.

## Edit 1 — 총괄 미니맵에 좌표 오버레이 추가

앵커(정확 일치, 1줄):
```
                        {/* 구 lineLabels 미니맵 렌더링 제거 (2026-08-28) */}
```
교체:
```
                        {/* 좌표 기준 오버레이 (2026-09-04): 총괄 미니맵도 단독 뷰와 동일한 번호 라벨 — 존 위치·유무 무관 */}
                        {k === "A" && (() => {
                          const sysO = buildGridCoordSystem("A", dl.zones);
                          if (!sysO) return null;
                          return Array.from(A_COORD_NOS.entries()).map(([coordO, nosO]) => {
                            const cMatchO = /^(\d+)-(\d+)$/.exec(coordO);
                            if (!cMatchO) return null;
                            const colPxO = sysO.colReps[Number(cMatchO[1]) - 1];
                            const rowPxO = sysO.rowRepsDesc[Number(cMatchO[2]) - 1];
                            if (colPxO == null || rowPxO == null) return null;
                            return (
                              <div
                                key={`ovl-${coordO}`}
                                className="absolute pointer-events-none text-[8px] leading-none font-mono font-bold text-amber-600"
                                style={{
                                  left: colPxO - SLOT.w / 2 + 2,
                                  top: rowPxO - SLOT.h / 2 + 3,
                                  width: SLOT.w - 4,
                                  textAlign: "left",
                                }}
                              >
                                {fmtLocNos(nosO)}
                              </div>
                            );
                          });
                        })()}
```

## Edit 2 — MiniZoneCell의 A동 번호 칩 제거 (오버레이로 대체)

앵커(정확 일치):
```
      {/* 로케이션 번호 — 좌표 귀속(coordNosByZone)만 사용, z.locNo 폴백 제거 (스테일 차단) —
          칸 내부 상단 배치 (단독 뷰 좌표 오버레이와 동일, 2026-09-04) */}
      {isA && locNos && locNos.length > 0 && (
        <span
          className="absolute text-[8px] leading-none font-mono font-bold text-amber-600 pointer-events-none"
          style={{ top: 1, left: 2, width: SLOT.w - 4, textAlign: "left" }}
        >
          {fmtLocNos(locNos)}
        </span>
      )}
```
처리: 블록 전체 삭제 — 교체 텍스트는 한 줄 주석:
```
      {/* 로케이션 번호 — 좌표 기준 오버레이로 단일 렌더 (2026-09-04, 총괄=단독 통일) */}
```

## 금지 사항

- 좌표 계산(buildGridCoordSystem)·A_COORD_NOS **수정 금지**
- `!isA` 칩(B/C/D — 데이터 없어 미렌더) **수정 금지**
- `miniNos` 변수·locNos prop 전달 **유지** (제거 시 TS6133 발생 방지)
- ZoneCell·MobileListView **수정 금지**
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "ovl-" frontend/client/src/pages/product-display.tsx` → 1 이상
4. 변경 요약 출력
