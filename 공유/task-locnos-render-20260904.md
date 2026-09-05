# 구현 지시서: 로케이션 번호 표시 최종 정리 (좌표 귀속 모델 완성)

> 아래 변경을 **정확히 그대로** 적용하라. 각 Edit의 앵커를 찾아 주어진 코드로 교체/삽입/삭제한다.
> 대상: `frontend/client/src/pages/product-display.tsx`

## 배경 (확정)

- 번호는 **좌표에 귀속** (사용자 확정: (4,14)=61, 37번 빈 칸 표기, 칸 이동해도 번호는 자리의 것)
- 기준표 `A_COORD_NOS`(좌표→번호)가 유일한 번호 원본 — 존 저장값은 표시에 사용하지 않는다
- 확인된 문제 2건:
  1. coordNosByZone이 전 동을 순회 → B/C/D 존이 A동 기준표 좌표와 우연히 충돌해 엉뚱 번호 표시
  2. gridLabels 로케이션 라벨 + ZoneCell 측면 칩 **이중 렌더** — 칩이 칸 옆 -18px 바깥에 밀려 보임 (사용자 추가 칸 line=-1 → 홀짝 판정 오류)

## Edit 1 — coordNosByZone A동 전용 게이트 (B/C/D 충돌 차단)

앵커:
```
  // 좌표 귀속 번호 (2026-09-04): 각 존이 현재 차지한 좌표의 기준표 번호 — 이동·유무와 무관
  const coordNosByZone = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const lay of layoutState) {
      const sys = buildGridCoordSystem(lay.key, lay.zones);
      if (!sys) continue;
```
교체:
```
  // 좌표 귀속 번호 (2026-09-04): 각 존이 현재 차지한 좌표의 기준표 번호 — 이동·유무와 무관.
  // 기준표는 A동 전용 — B/C/D는 좌표로만 식별 (기존 결정) — 동 간 좌표 충돌 방지
  const coordNosByZone = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const lay of layoutState) {
      if (lay.key !== "A") continue;
      const sys = buildGridCoordSystem(lay.key, lay.zones);
      if (!sys) continue;
```

## Edit 2 — gridLabels 로케이션 라벨 섹션 제거 (단일 렌더 확립)

앵커(정확 일치):
```
      // 로케이션 번호 통로 배치 (A동 포함): 칸 위쪽 통로 여유 >= 13px면 칸 밖에 표시
      const locOuter = new Set<string>();
      const TOLC = SLOT.w * 0.6;
      current.zones.forEach((z) => {
        const nos = dongLocNos[z.id];
        if (!nos || nos.length === 0) return;
        // 다품목 칸은 칸 내부에 구획별 로케이션 표시 — 통로 외부 라벨 생략 (2026-08-29)
        const multiCount = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean).length;
        if (multiCount > 1) return;
        const zx = Number(z.style.left ?? 0);
        const zy = Number(z.style.top ?? 0);
        const zw = Number(z.style.width ?? SLOT.w);
        let aboveBottom = 0;
        for (const o of current.zones) {
          if (o.id === z.id) continue;
          const ox = Number(o.style.left ?? 0);
          if (Math.abs(ox - zx) > TOLC) continue;
          const ob = Number(o.style.top ?? 0) + Number(o.style.height ?? SLOT.h);
          if (ob <= zy + 2 && ob > aboveBottom) aboveBottom = ob;
        }
        if (zy - aboveBottom >= 13) {
          locOuter.add(z.id);
          labels.push({
            text: fmtLocNos(nos),
            style: { left: zx, top: zy - 10, width: zw, textAlign: "center", fontSize: 8, fontWeight: 700, color: "#d97706", fontFamily: "ui-monospace, monospace" },
          });
        } else {
          // 통로 여유가 부족하면 칸 내부에 로케이션 번호 표시
          labels.push({
            text: fmtLocNos(nos),
            style: { left: zx + 2, top: zy + 4, width: zw - 4, textAlign: "center", fontSize: 7, fontWeight: 600, color: "#d97706", fontFamily: "ui-monospace, monospace" },
          });
        }
      });

      return { labels, coordOf, locOuter };
```
교체:
```
      // 로케이션 번호 표시는 ZoneCell 측면 칩으로 단일 렌더 (2026-09-04 정리 — 이중 렌더 제거)
      return { labels, coordOf, locOuter: new Set<string>() };
```

## Edit 3 — ZoneCell 측면 번호 칩 복원 (위치 기준 사이드) + 부모 전달

앵커 1 (ZoneCell 내 — 이전 작업에서 삭제된 칩 자리, `!isA && locNos` 블록 바로 앞):
```
      {!isA && locNos && locNos.length > 0 && (
```
→ 바로 앞에 다시 추가:
```
      {/* 로케이션 번호 — 단일 품목 칸 (좌표 귀속 번호, 2026-09-04): 사이드는 가까운 통로 방향 */}
      {items.length <= 1 && isA && locNos && locNos.length > 0 && (
        <span
          className="absolute text-[9px] leading-none font-mono font-bold text-amber-600 pointer-events-none"
          style={{
            top: 1,
            ...(chipSide === "left" ? { left: -18 } : { right: -18 }),
          }}
        >
          {fmtLocNos(locNos)}
        </span>
      )}
```

앵커 2 (ZoneCell props 인터페이스 — locNos?: number[]; 줄):
```
  locNos?: number[];
```
(ZoneCell 함수 선언부의 props 타입 정의 내) → 바로 다음 줄에 추가:
```
  chipSide?: "left" | "right";
```

앵커 3 (ZoneCell 구조분해 — `locNos,` 줄):
```
  locNos,
```
(ZoneCell 함수 선언부의 구조분해 내) → 바로 다음 줄에 추가:
```
  chipSide,
```

앵커 4 (부모 렌더 — ZoneCell 호출부의 locNos prop):
```
                locNos={gridLabels.locOuter.has(z.id) ? undefined : dongLocNos[z.id]}
```
교체:
```
                locNos={dongLocNos[z.id]}
                chipSide={Number((gridLabels.coordOf.get(z.id) || "0-0").split("-")[0]) % 3 === 0 ? "left" : "right"}
```

## Edit 4 — MiniZoneCell(미니맵) 칩 사이드 통일

앵커 (MiniZoneCell 내 — 이전에 Math.abs를 적용했다면 생략):
```
            ...(z.line % 2 === 1 ? { left: -18 } : { right: -18 }),
```
교체:
```
            ...(Math.abs(z.line) % 2 === 1 ? { left: -18 } : { right: -18 }),
```

## 금지 사항

- 좌표 계산 코드(buildGridCoordSystem·computeGridCoords·coordOf) **수정 금지**
- A_LOCNO_MAP/A_LOCNOS_MAP 데이터 값 **삭제 금지**
- mirrorLocNos/syncLocNosAfterDataChange **삭제 금지**
- B/C/D 표시 로직 **수정 금지**

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "locOuter" frontend/client/src/pages/product-display.tsx` → 2 이하 (정의+반환만)
4. `grep -c "chipSide" frontend/client/src/pages/product-display.tsx` → 3 이상
5. 변경 요약 출력
