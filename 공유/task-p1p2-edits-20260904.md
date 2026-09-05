# 정밀 편집 지시서: P1 엑셀 업로드 동 처리 + 존ID 폴백 제거 + P2 잔재 정리

> 아래 변경을 **정확히 그대로** 적용하라. 분석·재설계 금지 — 앵커 텍스트를 찾아 주어진 코드로 교체만 한다.

## Edit 1 — coordToZoneAll 동별 키 (frontend/client/src/pages/product-display.tsx)

앵커(정확 일치):
```
  const coordToZoneAll = useMemo(() => {
    const m = new Map<string, string>();
    coordOfAll.forEach((coord, zid) => { if (!m.has(coord)) m.set(coord, zid); });
    return m;
  }, [coordOfAll]);
```
교체:
```
  const coordToZoneAll = useMemo(() => {
    // 동별 좌표 키 (2026-09-04): "A-9-21" — 동 간 동일 좌표 문자열 충돌 방지
    const m = new Map<string, string>();
    coordOfAll.forEach((coord, zid) => {
      const key = `${zid.split("-")[0]}-${coord}`;
      if (!m.has(key)) m.set(key, zid);
    });
    return m;
  }, [coordOfAll]);
```

## Edit 2 — 업로드 동 필터 수정 (좌표 형식 오스킵 방지)

앵커:
```
      const cellDong = cellName ? cellName.split("-")[0] : "";
      if (cellDong && cellDong !== activeDong) continue;
```
교체:
```
      const cellDong = cellName ? cellName.split("-")[0] : "";
      // 좌표 형식("9-21")은 split[0]이 숫자 → 동 문자(ABCD)일 때만 동 필터 적용 (2026-09-04)
      if (cellDong && /^[ABCD]$/.test(cellDong) && cellDong !== activeDong) continue;
```

## Edit 3 — 업로드 좌표 조회 동별 키

앵커:
```
      const coordMatch = p.cellName ? coordToZoneAll.get(p.cellName) : undefined;
```
교체:
```
      const coordMatch = p.cellName ? coordToZoneAll.get(`${p.dong}-${p.cellName}`) : undefined;
```

## Edit 4 — 검색 hit loc 존ID 폴백 제거

앵커:
```
          hitOf({ pnum: pn, name, loc: loc || zid, locNo, zone: zid, dong, placed: true });
```
교체:
```
          hitOf({ pnum: pn, name, loc: loc || "", locNo, zone: zid, dong, placed: true });
```

## Edit 5 — 엑셀 export cellName 존ID 폴백 제거

앵커:
```
          cellName: coordOf.get(zoneId) || zoneId,
```
교체:
```
          cellName: coordOf.get(zoneId) || "",
```

## Edit 6 — 검색 결과 좌표 표시 존ID 폴백 제거

앵커:
```
                          ? `위치 ${h.dong}동 좌표 ${h.zone ? fmtCoordKey(coordOfAll.get(h.zone) || h.zone) : ""}${h.locNo ? ` · 로케이션 ${h.locNo}` : ""}`
```
교체:
```
                          ? `위치 ${h.dong}동${h.zone && coordOfAll.get(h.zone) ? ` 좌표 ${fmtCoordKey(coordOfAll.get(h.zone))}` : ""}${h.locNo ? ` · 로케이션 ${h.locNo}` : ""}`
```

## Edit 7 — 위치번호 패널 존ID 폴백 제거

앵커:
```
                    {locNoOf(r.zid) || r.zid}
```
교체:
```
                    {locNoOf(r.zid) || "번호 없음"}
```
(앵커가 고유하지 않으면 locNoOf를 포함한 동일 패턴 전부 적용)

## Edit 8 — backend/sales_api/views.py 주석 정정

앵커:
```
# 보관 상한 — 직전 버전 1개만 보관 (복원용), 초과 시 오래된 것부터 삭제 (2026-08-25)
_PD_KEEP_COUNT = 2
```
교체:
```
# 보관 상한 — 직전 2개 보관 (복원용), 초과 시 오래된 것부터 삭제 (2026-09-04 주석 정정: 값=2와 일치)
_PD_KEEP_COUNT = 2
```

## Edit 9 — backend/sales_api/management/commands/sync_placement_locations.py 안전 가드

앵커:
```
    def handle(self, *args, **options):
        dongs_raw = str(options.get("dongs") or "").strip()
```
교체:
```
    def handle(self, *args, **options):
        import os
        if not os.environ.get("PLACEMENT_SYNC_ENABLED"):
            self.stdout.write(self.style.WARNING(
                "[비활성] placement sync는 2026-09-03 좌표 규칙(마스터 location 자동 덮어쓰기 금지)에 "
                "따라 기본 차단됩니다. 수동 실행 시 PLACEMENT_SYNC_ENABLED=1 환경변수를 설정하세요."
            ))
            return
        dongs_raw = str(options.get("dongs") or "").strip()
```

## 금지 사항

- noToZone(위치번호 폴백) 로직·좌표 코드·locNos 미러링 코드 **수정 금지**
- placement_location_sync.py 모듈 본체는 건드리지 않고 커맨드 진입 가드만 추가
- 그 외 모든 로직 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `python3 -m py_compile backend/sales_api/management/commands/sync_placement_locations.py backend/sales_api/views.py` → 오류 0
4. `grep -c 'zid.split("-")[0]}-${coord}' frontend/client/src/pages/product-display.tsx` → 1
5. 변경 요약 출력
