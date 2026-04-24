# VF 입고 가능 탭 버그 리포트

**작성일**: 2026-04-24
**수정 파일**: `inbound-availability-tab.tsx`
**상태**: 수정 완료 ✅

---

## 버그 요약

### 1. ReferenceError: Cannot access 'visibleInboundLines' before initialization

**증상**:
```
Uncaught ReferenceError: Cannot access 'visibleInboundLines' before initialization
at InboundAvailabilityTab (inbound-availability-tab.tsx:509:56)
```

**원인**:
- `visibleInboundLines`가 `handleExportExcel` 함수 **뒤에** 선언됨
- `handleExportExcel` 함수 내부에서 `visibleInboundLines`를 참조하지만, 해당 변수가 아직 초기화되지 않음

**코드 순서 문제**:
```tsx
// Line 282: handleExportExcel 함수 정의 (visibleInboundLines 사용)
const handleExportExcel = () => {
  if (visibleInboundLines.length === 0) {  // ❌ 여기서 참조
    // ...
  }
};

// Line 337: visibleInboundLines 선언 (handleExportExcel 뒤)
const visibleInboundLines = useMemo(() => {  // ✅ 나중에 선언
  // ...
};
```

**수정**:
- `visibleInboundLines` 선언을 `handleExportExcel` 앞으로 이동
- `handleExportExcel`에서 사용하는 `editedQuantities`, `inventoryMap`, `getAvgDailyOutbound`, `periodDays`, `uploadInfo` 모두 앞에 선언 필요

---

### 2. 중복 선언 버그

**증상**:
```
error during build:
ERROR: The symbol "visibleInboundLines" has already been declared
```

**원인**:
- OpenCoder가 수정 시 `visibleInboundLines`를 **두 번 선언**함
- 첫 번째 선언 (Line 337): 새로운 위치로 이동됨
- 두 번째 선언 (Line 523): 이전 위치에 그대로 남음

**수정**:
- 중복된 선언 (Line 523-543) 삭제

---

### 3. 총 합계가 비정상적으로 낮음 (19 vs 803)

**증상**:
- 14일 기준에서 총 추천 확정 수량이 803이 아닌 19로 표시

**원인 분석**:
1. `inboundAvailableByRow` 계산이 `inboundAvailableByBarcode` Map과 다른 방식으로 계산됨
2. Enhanced 평균일일출고 계산법 문제
3. `avgDailyOutbound`가 0이거나 너무 낮게 계산됨

**로그 확인**:
```
[DEBUG inboundAvailableByRow] total rows: 403
[DEBUG inboundAvailableByRow] unique barcodes: 403
[DEBUG inboundAvailableByRow] sum of all values: 19  ← 이상함

[DEBUG inboundAvailableByBarcode] map size: 403
[DEBUG inboundAvailableByBarcode] sum of all values: 19  ← 동일
```

**추정 원인**:
- Enhanced 계산법 (`calcEnhancedAvgDaily`)에서 백엔드 일별 출고 데이터(`/api/outbound/barcode-daily?days=60`)가 제대로 조회되지 않음
- `dailyData`가 비어있어서 `avgDailyOutbound`가 0이 됨
- 0이면 `targetStock`도 0이 되어 `needToTarget`도 0

---

### 4. Enhanced 평균일일출고 계산법 문제

**구현된 로직**:
1. **월초 가중치**: 선택 기간에 1일~5일 포함 시 이전달 데이터 추가
2. **최근 추세 가중치**: 최근 7일 1.5배, 예전 7일 1.0배

**코드 문제**:
```tsx
const calcEnhancedAvgDaily = (barcode: string): number => {
  // ...
  const dailyData = outboundDailyMap.get(barcode) || [];
  // dailyData가 비어있을 수 있음
  if (dailyData.length === 0) {
    // 이 경우 기존 14일/30일 aggregate 사용해야 하지만...
  }
  // ...
};
```

**문제점**:
- 백엔드에서 `/api/outbound/barcode-daily` API가 없거나 데이터가 없음
- `outboundDailyMap`이 비어있음
- 따라서 Enhanced 계산이 0이 됨

---

## 수정 내용

### 수정 1: 선언 순서 변경
- `visibleInboundLines`를 `handleExportExcel` 앞으로 이동
- 관련 변수들 (`editedQuantities`, `inventoryMap`, `getAvgDailyOutbound`, `periodDays`, `uploadInfo`) 모두 앞에 선언

### 수정 2: 중복 선언 제거
- Line 523-543의 중복 `visibleInboundLines` 선언 삭제

### 수정 3: 합계 계산 로직 통일
- `totalInboundAvailable`에서 `visibleInboundLines` 기반 직접 계산
- `inboundAvailableByRow` 사용 (per-row 계산)

---

## 현재 상태 (2026-04-24 21:41)

| 항목 | 상태 |
|---|---|
| ReferenceError | ✅ 수정 완료 |
| 중복 선언 | ✅ 수정 완료 |
| 합계 표시 | ✅ 803으로 복원 (14일 기준) |
| Enhanced 계산법 | ⚠️ 백엔드 API 확인 필요 |
| 빌드 | ✅ 성공 |
| Git 업로드 | ✅ 완료 (커밋 0538654) |

---

## TODO

- [ ] 백엔드 `/api/outbound/barcode-daily` API 존재 확인
- [ ] 일별 출고 데이터가 없으면 기존 aggregate数据进行比例計算
- [ ] Enhanced 계산법 로직 검증
- [ ] 프로덕션 배포 후 실제 데이터 확인
