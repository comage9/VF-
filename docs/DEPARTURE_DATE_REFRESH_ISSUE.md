# 출차 관리(departure) 페이지 — 날짜 선택 / 새로고침 문제 원인 분석 및 해결 방안

> 작성일: 2026-07-24  
> 대상 파일: `backend/departure/templates/departure/dashboard.html`  
> 관련 API: `/departure/api/ls-data`, `/departure/api/vehicle-extras`  
> 연관 이슈: [이전/오늘 버튼 전환](DEPARTURE_PREV_TODAY_ISSUE.md) · README §6.0c G

---

## 1. 문제 현상

사용자 보고 (2가지):

1. **"새로고침하면 출차카드 입력 내용이 다 사라진다. 저장되어야 하고, 초기화 버튼 클릭 시만 입력 내용이 사라져야 한다."**
2. **"일자 선택 시 해당 내용이 제대로 반영이 안 되는 문제가 있다."** (스크린샷: 7/23 선택했는데 VF67 카드가 비어있음)

---

## 2. 원인 분석

### 2.1 데이터 저장 구조 (정상 동작 확인)

VF67 출차카드 데이터는 **두 곳에 분리 저장**됩니다:

| 데이터 | 저장 위치 | 저장 시점 |
|--------|-----------|-----------|
| 차량 정보 (plate, driver, phone, ton, time, hub) | DB `departure_records` 테이블 | PDF 등록 / 배차 확정 시 |
| **파렛트 수량 (plt)** | DB `departure_records.plt` + `vehicle_extras_{date}.json` | qty 입력 / 파렛트 변경 시 |
| **권역별 수량 (EAST/WEST/MIDDLE/GMH/DGU/GWJ/TW_YAMATO)** | `vehicle_extras_{date}.json` (파일) | 권역 입력 시 |
| 봉인 씰 (seals) | DB `departure_records` | 씰 입력 시 |

**저장 로직 검증 결과**: 모두 정상 동작함.
- `onVF67QtyChange` → `onPalletChange` → DB + vehicle_extras 저장 ✅
- `onVF67RegionChange` → `persistVehicleExtras` → vehicle_extras 저장 ✅

### 2.2 핵심 원인: 새로고침 시 **선택 날짜가 오늘로 리셋**

```
페이지 로드 (또는 새로고침)
  └─ var currentDate = getTodayWorkDate();   ← 무조건 오늘 날짜
     └─ loadFromServerAndRender()
        └─ fetch('/departure/api/ls-data?date=오늘')
           └─ 오늘 날짜 데이터 조회 (어제 데이터 아님!)
```

**문제 시나리오**:
1. 사용자가 7/23(어제) 날짜 선택 → 7/23 데이터 확인 → VF67 카드에 수량/권역 입력
2. 입력 데이터는 서버에 정상 저장됨 (DB + vehicle_extras_{2026-07-23}.json)
3. **새로고침 발생** → `currentDate = getTodayWorkDate()` 실행 → **날짜가 7/24(오늘)로 리셋**
4. 7/24 데이터를 조회 → 7/24에는 출차 데이터가 없음 → **VF67 카드 0개 표시**
5. 사용자에게는 "입력 내용이 다 사라진 것"으로 보임

### 2.3 근증거 (헤드리스 브라우저 검증)

```
새로고침 전: picker=2026-07-23, qty2=8, east2=5  (정상 입력됨)
새로고침 후: picker=2026-07-24, 카드 수=0, LS_DATA=[]  (오늘로 리셋됨)
```

저장된 파일 확인:
- `vehicle_extras_2026-07-23.json`: `{ "2": { "plt": 8, "regions": {"EAST": 5} } }` ← **데이터 살아있음**
- DB `departure_records` (2026-07-23): 3건 정상 존재

→ **데이터는 유실되지 않았음. 단지 새로고침 후 다른 날짜(오늘)를 보여줬을 뿐.**

### 2.4 부가 원인: 06:00 작업일 기준 보정

`getWorkDate()` 함수는 06:00 이전 시 전날을 반환 (야간 작업일 기준).
새벽 시간대에 새로고침하면 "오늘"이 전날로 잡히면서 혼란 가중.

---

## 3. 해결 방안 (적용 완료)

### 3.1 선택 날짜 localStorage 영속화

`dashboard.html` 수정 내용:

```javascript
// 신규 추가: 마지막 선택 날짜를 localStorage에 저장/복원
var _DEP_DATE_KEY = 'departure_selected_date';

function _restoreSelectedDate() {
  try {
    var saved = localStorage.getItem(_DEP_DATE_KEY);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      var d = new Date(saved + 'T00:00:00');
      // 저장된 날짜는 사용자가 명시적으로 선택한 날짜 → getWorkDate(06:00 보정) 재적용 안 함
      if (!isNaN(d.getTime())) return d;
    }
  } catch(e) {}
  return getTodayWorkDate();   // 저장값 없으면 오늘 작업일
}

function _persistSelectedDate(dateStr) {
  try { localStorage.setItem(_DEP_DATE_KEY, dateStr); } catch(e) {}
}

// 기존: var currentDate = getTodayWorkDate();
// 변경:
var currentDate = _restoreSelectedDate();   // 새로고침 시 마지막 선택 날짜 복원
```

`updateDateDisplay()`에 영속화 호출 추가:

```javascript
function updateDateDisplay() {
  // ... 기존 로직 ...
  _persistSelectedDate(formatDate(currentDate));   // 신규: 선택 날짜 저장
}
```

### 3.2 설계 의도

- **사용자가 명시적으로 선택한 날짜**는 작업일 보정(06:00)을 거치지 않고 그대로 복원
- "오늘" 버튼(`goToday()`) 클릭 시에만 `getTodayWorkDate()`로 이동 — 이때도 localStorage 업데이트
- 최초 방문 (localStorage 비어있음) 시에는 오늘 작업일로 시작

---

## 4. 검증 결과

헤드리스 브라우저(Playwright) 자동 테스트:

### 테스트 1: 날짜 7/22 선택 후 새로고침
```
변경 직후:  picker=2026-07-22, 카드=3, plate1='충남83바8127'
새로고침 후: picker=2026-07-22, 카드=3, plate1='충남83바8127'   ✅
```

### 테스트 2: 7/23 선택, WEST=99 입력 후 새로고침
```
새로고침 후: picker=2026-07-23, WEST_1=99   ✅
```

### 테스트 3: 키보드 입력(qty=8, EAST=5) 후 새로고침
```
Enter 후 포커스: vf67_EAST_2   ✅ (qty → EAST 이동)
Tab 후 포커스: vf67_WEST_2      ✅ (EAST → WEST 이동)
새로고침 후: picker=2026-07-23, qty2=8, east2=5   ✅ (데이터 유지)
```

### 테스트 4: "오늘" 버튼
```
클릭 후: picker=2026-07-24, display='7/24 (금) (오늘)'   ✅
```

---

## 5. 데이터 흐름 (수정 후)

```
페이지 로드 / 새로고침
  ├─ localStorage에서 마지막 선택 날짜 복원 (없으면 오늘)
  └─ loadFromServerAndRender()
     ├─ GET /departure/api/ls-data?date=<선택날짜>  → LS_DATA (차량정보 + plt)
     ├─ GET /departure/api/vehicle-extras?date=<선택날짜>  → regions/출고시간
     │    └─ mergeExtrasIntoLsData() → LS_DATA에 regions 병합
     └─ loadDateData() → renderAllWithData() → VF67 카드 렌더링

날짜 변경 (datePicker / 이전/다음/오늘 버튼)
  ├─ currentDate 갱신
  ├─ updateDateDisplay() → localStorage에 새 날짜 저장
  └─ loadFromServerAndRender() → 위와 동일

VF67 카드 입력 (qty / regions)
  ├─ 서버 저장 (DB + vehicle_extras 파일)   ← 포커스 유지를 위해 재렌더링 안 함
  └─ LS_DATA 메모리 동기화만 수행
```

---

## 6. 정리

| 항목 | 상태 |
|------|------|
| 데이터 저장 (DB + vehicle_extras) | ✅ 정상 (처음부터 문제 없음) |
| 새로고침 시 날짜 유지 | ✅ 해결 (localStorage 영속화) |
| 새로고침 시 VF67 카드 데이터 복원 | ✅ 해결 (날짜 유지로 자연 해결) |
| 키보드 입력 후 포커스 이동 | ✅ 정상 (Enter/Tab → 다음 칸) |
| 키보드 입력 후 데이터 저장 | ✅ 정상 (서버 저장됨, 새로고침 후 유지) |
| "초기화" 버튼 (🔄) | ✅ 정상 (해당 호차 데이터만 삭제, 서버 반영) |

**결론**: "새로고침하면 데이터가 사라진다"는 현상의 실제 원인은 **데이터 유실이 아니라 새로고침 후 조회 날짜가 오늘로 리셋**되는 것이었습니다. localStorage 영속화로 해결 완료.

---

## 7. 추가 보강 (2026-07-24)

### 7.1 날짜 복원 우선순위

1. URL `?date=YYYY-MM-DD` (공유·북마크)
2. `localStorage.departure_selected_date`
3. 오늘 작업일 (`getTodayWorkDate`, 06:00 보정)

날짜 변경 시 `history.replaceState` 로 URL `?date=` 동기화.

### 7.2 vehicle_extras 포맷

구파일 `{ "extras": { "1": ... } }` 중첩 → API/프론트에서 flat `{ "1": ... }` 로 정규화.

### 7.3 서버 전용 인쇄

| 항목 | 내용 |
|------|------|
| 동작 | 클라이언트는 `fetch('/departure/api/print/...')` 만 호출 |
| 인쇄 위치 | **Django 실행 PC** (`win32` GDI / `printto`) |
| 프린터 | `.env` `DEPARTURE_PRINTER_NAME` (기본 `Canon G2010 series`) |
| 외부 PC | 버튼 클릭해도 **서버 프린터**로 출력 (브라우저 로컬 인쇄 없음) |
| UI 안내 | 토스트에 `서버 프린터 (이름)` 표시 |

관련: `views._print_pdf_on_server`, `api_print` · `executePrint` (window.print 미사용).
