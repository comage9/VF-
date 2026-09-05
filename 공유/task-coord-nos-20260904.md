# 구현 지시서: 로케이션 번호 좌표 귀속 모델 (§7.5 확정안)

> 아래 변경을 **정확히 그대로** 적용하라. 각 Edit의 앵커를 찾아 주어진 코드로 교체/삽입한다.
> 대상: `frontend/client/src/pages/product-display.tsx`

## 배경 (확정 모델)

로케이션 번호는 **좌표에 귀속**된다 (사용자 확정: (4,14)=61, 37번 빈 칸 표기, 칸 이동해도 번호 불변).
기준표 `A_COORD_NOS`: 표준 좌표("X-Y") → 번호 배열. 화면 표시는 존 저장값이 아니라 **존이 현재 차지한 좌표의 기준표 번호**를 렌더한다 (좌표 기준 오버레이 — §7.5 요구 2).

## Edit 1 — A_LOCNO_MAP에 L1-1=37 추가 (37 결번 해소, 빈 칸 표기)

앵커:
```
const A_LOCNO_MAP: Record<string, number> = {
  "L1-19": 1, "L2-19": 2, "L2-18": 3, "L1-18": 4,
```
교체:
```
const A_LOCNO_MAP: Record<string, number> = {
  "L1-1": 37, "L1-19": 1, "L2-19": 2, "L2-18": 3, "L1-18": 4,
```

## Edit 2 — 좌표↔번호 기준표 A_COORD_NOS 추가

앵커 (A_LOCNOS_MAP 닫힘 직후):
```
  "L7-5": [144, 145], "L7-6": [146, 147], "L7-7": [148, 149], "L7-8": [150, 151],
};
```
교체 (닫힘 유지 + 직후 삽입):
```
  "L7-5": [144, 145], "L7-6": [146, 147], "L7-7": [148, 149], "L7-8": [150, 151],
};

/** 좌표↔로케이션 번호 기준표 (2026-09-04): 번호는 좌표에 귀속 — 존 이동·유무와 무관.
 *  슬롯 키(L{라인}-{슬롯}) → 표준 좌표("X-Y") → 번호 배열. 라인→X: L1=9·L2=7·L3=6·L4=4·L5=3·L6=1,
 *  세로 열 슬롯 s → Y=s+2 (Y2=통로), L7-n → 하단 행 (X=n, Y=1). L1-1=37(빈 칸 표기 — 사용자 확정). */
const A_COORD_NOS: Map<string, number[]> = (() => {
  const colMap: Record<string, number> = { L1: 9, L2: 7, L3: 6, L4: 4, L5: 3, L6: 1 };
  const m = new Map<string, number[]>();
  const put = (coord: string, nos: number[]) => { m.set(coord, nos); };
  for (const [key, no] of Object.entries(A_LOCNO_MAP)) {
    const lm = /^(L\d+)-(\d+)$/.exec(key);
    if (!lm) continue;
    const l7 = lm[1] === "L7";
    const cx = l7 ? Number(lm[2]) : colMap[lm[1]];
    if (!cx) continue;
    put(`${cx}-${l7 ? 1 : Number(lm[2]) + 2}`, [no]);
  }
  for (const [key, nos] of Object.entries(A_LOCNOS_MAP)) {
    const lm = /^(L\d+)-(\d+)$/.exec(key);
    if (!lm) continue;
    const l7 = lm[1] === "L7";
    const cx = l7 ? Number(lm[2]) : colMap[lm[1]];
    if (!cx) continue;
    put(`${cx}-${l7 ? 1 : Number(lm[2]) + 2}`, nos);
  }
  return m;
})();
```

## Edit 3 — coordNosByZone 추가 (전 존의 좌표 귀속 번호)

앵커 (coordToZoneAll 블록 직후):
```
    return m;
  }, [coordOfAll]);
```
교체:
```
    return m;
  }, [coordOfAll]);

  // 좌표 귀속 번호 (2026-09-04): 각 존이 현재 차지한 좌표의 기준표 번호 — 이동·유무와 무관
  const coordNosByZone = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const lay of layoutState) {
      const sys = buildGridCoordSystem(lay.key, lay.zones);
      if (!sys) continue;
      for (const z of lay.zones) {
        const coord = sys.coordOf.get(z.id);
        if (!coord) continue;
        const nos = A_COORD_NOS.get(coord);
        if (nos && nos.length) m.set(z.id, nos);
      }
    }
    return m;
  }, [layoutState]);
```
(단, `}, [coordOfAll]);` 앵커가 파일 내 여러 곳이면 coordToZoneAll 블록 직후임을 주석으로 확인 후 삽입)

## Edit 4 — gridLabels 번호 소스를 좌표 귀속으로 교체

앵커:
```
  // 로케이션 번호 지도 — 저장된 칸 번호(zone.locNo)만 읽음 (2026-08-31 자동 배정 삭제)
  const dongLocNos = useMemo(() => storedLocNos(current.zones), [current]);
```
교체:
```
  // 로케이션 번호 지도 — 좌표 귀속 (2026-09-04): 각 존이 현재 차지한 좌표의 기준표 번호.
  // 존 이동·유무와 무관하게 번호는 좌표에 고정 ((4,14)=61·37번 빈 칸 표기 — 사용자 확정).
  const dongLocNos = useMemo(() => {
    const out: Record<string, number[]> = {};
    const sys = buildGridCoordSystem(dong, current.zones);
    if (!sys) return out;
    for (const z of current.zones) {
      const coord = sys.coordOf.get(z.id);
      if (!coord) continue;
      const nos = A_COORD_NOS.get(coord);
      if (nos && nos.length) out[z.id] = nos;
    }
    return out;
  }, [dong, current.zones]);
```

## Edit 5 — pnumLocNoMap(검색 위치번호) 좌표 귀속 교체

앵커:
```
  // 제품번호 → 배치도 위치번호 맵(전 동) — 저장된 칸 번호(zone.locNo)만 읽음 (2026-08-31 자동 배정 삭제)
  const pnumLocNoMap = useMemo(() => {
    const nosByZone: Record<string, number[]> = {};
    for (const d of layoutState) {
      Object.assign(nosByZone, storedLocNos(d.zones));
    }
```
교체:
```
  // 제품번호 → 배치도 위치번호 맵(전 동) — 좌표 귀속 (2026-09-04): 존의 현재 좌표의 기준표 번호
  const pnumLocNoMap = useMemo(() => {
    const nosByZone: Record<string, number[]> = {};
    for (const [zid, nos] of coordNosByZone) nosByZone[zid] = nos;
```
그리고 같은 useMemo의 의존성 배열 `[layoutState, data, locExceptions]` → `[coordNosByZone, data]`로 교체.

## Edit 6 — 엑셀 export 위치번호 열 좌표 귀속 교체

엑셀 export 함수 내 앵커:
```
    Object.assign(dongLocNos, storedLocNos(zs));
```
(export 함수 내 buildGridCoordSystem sys 블록 근처의 것 — 동일 앵커가 여러 건이면 export 함수 내부의 것만)
교체:
```
    sys.coordOf.forEach((v, zid) => {
      const nos = A_COORD_NOS.get(v);
      if (nos) dongLocNos[zid] = nos;
    });
```

## Edit 7 — ZoneCell 단일 품목 번호 칩 제거 (이중 렌더·우측 밀림 해소)

앵커:
```
      {/* 로케이션 번호 — 단일 품목 칸만 외부/우상단 표시 (다품목은 구획별 내부 표시, 2026-08-29) */}
      {items.length <= 1 && isA && ((locNos && locNos.length > 0) || z.locNo != null) && (
        <span
          className="absolute text-[9px] leading-none font-mono font-bold text-amber-600 pointer-events-none"
          style={{
            top: 1,
            ...(z.line % 2 === 1 ? { left: -18 } : { right: -18 }),
          }}
        >
          {locNos && locNos.length > 0 ? fmtLocNos(locNos) : z.locNo}
        </span>
      )}
```
→ 블록 전체 삭제. 삭제 후 ZoneCell의 locNos prop이 다른 곳에서 사용되지 않으면 인터페이스·구조분해·부모 전달(`locNos={...}`)도 정리하고, tsc로 잔여 오류 확인.

## Edit 8 — locNoOf 패널(로케이션 리스트) 좌표 귀속 교체

`mdyn`의 공급원을 추적해 storedLocNos 기반이면 `coordNosByZone`(전 동) 기반으로 교체하라.
패널이 별도 컴포넌트면 부모에서 `mdyn={coordNosByZone}` 형태로 전달하라 (Record<string, number[]> 동일 형태).

## Edit 9 — MiniZoneCell(미니맵) 번호 칩 확인

미니맵 번호 칩이 storedLocNos 기반이면 coordNosByZone 기반으로 교체. 번호 미표시 컴포넌트면 그대로 둔다.

## 금지 사항

- 좌표 계산 코드(buildGridCoordSystem·computeGridCoords·coordOf) **수정 금지**
- A_LOCNOS_MAP/A_LOCNO_MAP의 기존 데이터 값 **삭제 금지** (L1-1 추가만 허용)
- B/C/D 표시 로직 **수정 금지** (좌표만 표시 — 기존 결정 유지)
- mirrorLocNos/syncLocNosAfterDataChange **삭제 금지** (다른 뷰 호환용으로 유지, 표시에서는 미사용)

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. 노드 시뮬레이션 — 아래 스크립트를 파일로 저장해 실행하고 결과를 그대로 출력:
```js
// /tmp/coord-nos-verify.mjs — A_COORD_NOS 로직 재현 (지시서 Edit 2와 동일)
const A_LOCNO_MAP = {"L1-1":37,"L1-19":1,"L2-19":2,"L2-18":3,"L1-18":4,"L1-17":5,"L2-17":6,"L2-16":7,"L1-16":8,"L1-15":9,"L2-15":10,"L2-14":11,"L1-14":12,"L1-13":13,"L2-13":14,"L2-12":15,"L1-12":16,"L1-11":17,"L2-11":18,"L2-10":19,"L1-10":20,"L1-9":21,"L2-9":22,"L2-8":23,"L1-8":24,"L1-7":25,"L2-7":26,"L2-6":27,"L1-6":28,"L1-5":29,"L2-5":30,"L2-4":31,"L1-4":32,"L1-3":33,"L2-3":34,"L2-2":35,"L1-2":36,"L2-1":38,"L3-1":39,"L4-1":40,"L4-2":41,"L3-2":42,"L3-3":43,"L4-3":44,"L4-4":45,"L3-4":46,"L3-5":47,"L4-5":48,"L4-6":49,"L3-6":50,"L3-7":51,"L4-7":52,"L4-8":53,"L3-8":54,"L3-9":55,"L4-9":56,"L4-10":57,"L3-10":58,"L3-11":59,"L4-11":60,"L4-12":61,"L3-12":62,"L4-13":63,"L3-13":64,"L4-14":65,"L3-14":66,"L4-15":67,"L3-15":68,"L4-16":69,"L3-16":70,"L4-17":71,"L3-17":72,"L4-18":73,"L3-18":74,"L4-19":75,"L3-19":76,"L5-19":77,"L6-19":78,"L6-18":79,"L5-18":80,"L5-17":81,"L6-17":82,"L6-16":83,"L5-16":84,"L5-15":85,"L6-15":86,"L6-14":87,"L5-14":88,"L5-13":89,"L6-13":90,"L6-12":91,"L5-12":92,"L5-11":93,"L6-11":95,"L6-10":97,"L5-10":99,"L5-9":101,"L6-9":103,"L6-8":105,"L5-8":107,"L5-7":109,"L6-7":111,"L6-6":113,"L5-6":114,"L5-5":117,"L6-5":119,"L6-4":121,"L5-4":123,"L5-3":125,"L6-3":126,"L6-2":128,"L5-2":130,"L5-1":132,"L6-1":134,"L7-1":136,"L7-2":138,"L7-3":140,"L7-4":142,"L7-5":144,"L7-6":146,"L7-7":148,"L7-8":150};
const A_LOCNOS_MAP = {"L3-16":[74,75],"L4-16":[72,73],"L5-1":[132,133],"L5-2":[130,131],"L5-4":[123,124],"L5-5":[117,118],"L5-6":[114,115,116],"L5-7":[109,110],"L5-8":[107,108],"L5-9":[101,102],"L5-10":[99,100],"L5-11":[93,94],"L6-1":[134,135],"L6-2":[128,129],"L6-3":[126,127],"L6-4":[121,122],"L6-5":[119,120],"L6-7":[111,112],"L6-8":[105,106],"L6-9":[103,104],"L6-10":[97,98],"L6-11":[95,96],"L7-1":[136,137],"L7-2":[138,139],"L7-3":[140,141],"L7-4":[142,143],"L7-5":[144,145],"L7-6":[146,147],"L7-7":[148,149],"L7-8":[150,151]};
const colMap = { L1: 9, L2: 7, L3: 6, L4: 4, L5: 3, L6: 1 };
const m = new Map();
const put = (c, n) => m.set(c, n);
for (const [k, no] of Object.entries(A_LOCNO_MAP)) {
  const lm = /^(L\d+)-(\d+)$/.exec(k); if (!lm) continue;
  const l7 = lm[1] === "L7"; const cx = l7 ? Number(lm[2]) : colMap[lm[1]]; if (!cx) continue;
  put(`${cx}-${l7 ? 1 : Number(lm[2]) + 2}`, [no]);
}
for (const [k, nos] of Object.entries(A_LOCNOS_MAP)) {
  const lm = /^(L\d+)-(\d+)$/.exec(k); if (!lm) continue;
  const l7 = lm[1] === "L7"; const cx = l7 ? Number(lm[2]) : colMap[lm[1]]; if (!cx) continue;
  put(`${cx}-${l7 ? 1 : Number(lm[2]) + 2}`, nos);
}
const checks = [["4-14",[61]],["4-16",[65]],["9-3",[37]],["9-12",[20]],["9-21",[1]],["6-14",[62]],["1-1",[136,137]],["8-1",[150,151]]];
let pass = true;
for (const [c, exp] of checks) {
  const got = m.get(c) || null;
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) pass = false;
  console.log(`${c}: ${JSON.stringify(got)} 기대 ${JSON.stringify(exp)} ${ok ? "OK" : "FAIL"}`);
}
console.log(pass ? "ALL PASS" : "FAIL");
```
기대: (4,14)=61 ✅ (4,16)=65 ✅ (9,3)=37 ✅ (9,12)=20 ✅ (9,21)=1 ✅ (6,14)=62 ✅ (1,1)=[136,137] ✅ (8,1)=[150,151] ✅ → ALL PASS
4. 변경 요약 출력
