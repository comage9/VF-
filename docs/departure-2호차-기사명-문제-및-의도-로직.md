# VF Departure 페이지 - 2호차 기사명 자동 등록 문제 및 의도 로직

**작성일**: 2026-07-21  
**목적**: 사용자가 지적한 현재 문제와, departure 페이지에 대해 의도한 구성/로직을 문서화.

---

## 1. 현재 문제 사항 (사용자가 지적)

### 1.1 핵심 증상
- **2호차 기사명(드라이버 이름)이 자동으로 입력/등록되지 않는다.**
- 페이지에 차량은 표시되지만, 해당 차량의 기사명 필드가 비어 있음.

### 1.2 오늘(2026-07-21) 실제 데이터 (직접 확인 결과)

**LS 주문 순서 (ls_orders_2026-07-21.json)**:
1. 경기89바6845 (truckRequestId: 28757574)
2. 서울88아8047 (28757575)
3. 광주90바1703 (28757573)

**LS 데이터에서 driverName**: 모두 None

**PDF 파일 (ls_pdfs/2026-07-21/)**:
- 경기89바6845.pdf
- 서울88아8047.pdf
- 광주90바1703.pdf

**PDF에서 실제 기사명 (PyMuPDF 추출)**:
- 경기89바6845: **최규익** (성함 다음 줄)
- 서울88아8047: **이종민**
- 광주90바1703: **김경옥**

**hoche 배정 예상** (LS 순서 기반):
- 1호차: 경기89바6845 (최규익)
- **2호차: 서울88아8047 (이종민)** ← 문제 차량
- 3호차: 광주90바1703 (김경옥)

**현재 상태**:
- PDF 파싱 후 driver = ""
- vehicle_master fallback에도 오늘 plates에 대한 driverName 없음
- 결과: DepartureRecord.driver_name = "" 로 저장

---

## 2. 문제의 기술적 원인 (코드 검증 결과)

### 2.1 PDF 기사명 추출 로직 (downloader_parser.py)
```python
# extract_pdf_info 함수
driver_match = re.search(r'Name\s+([가-힣a-zA-Z]+)', text)
if driver_match:
    info["driver"] = driver_match.group(1).strip()
else:
    info["driver"] = ""
```
- **실제 PDF 포맷**: "성함\n이름" (예: 성함\n최규익)
- **예상 포맷**: "Name 이름"
- → 모든 오늘 PDF에서 driver 추출 실패

### 2.2 자동 등록 흐름 (scan_downloads_folder + add_vehicle_from_pdf)
1. LinehaulSlip PDF 스캔
2. extract_pdf_info → driver=""
3. ls_orders로 정렬 후 순차 hoche 배정 (1,2,3...)
4. vehicle_order_service.add_vehicle_from_pdf(..., hoche_override=hoche)
5. driver = info.get("driver") or master_driver or ""
6. DepartureRecord 저장 (driver_name 빈 값)

### 2.3 Fallback 미작동
- LS orders: driverName = None
- vehicle_db_merged.json: 오늘 plates(6845,8047,1703) 매칭 없음 (1454만 김동수 기록)

### 2.4 페이지 표시 측면
- views.py / get_today_order: DB의 driver_name 그대로 반환
- dashboard.html / departure-dashboard: driver 필드 빈 값 표시

---

## 3. 사용자가 의도한 Departure 페이지 구성 및 로직

### 3.1 전체 목표 (사용자 의도)
- **오늘 배차된 차량 정보가 자동으로 departure 페이지에 등록**되어야 함.
- 페이지 열자마자 현재 날짜의 차량들이 **hoche 순(1→2→3)**으로 보임.
- 기사명, 연락처, 차량번호, 톤, 시간, 봉인씰 등이 정확히 표시.
- 호차가 바뀌어도 **plate 기준**으로 PDF와 봉인씰이 따라가야 함.
- 수동 순서 변경 시에도 기사명/정보가 유지/업데이트.

### 3.2 핵심 원칙 (VehicleOrderService 단일 진입점, 2026-07-09 리팩토링)
- 모든 호차 배정, PDF, 봉인씰 로직을 **VehicleOrderService** 하나로 집중.
- **plate + date** 기준 매핑 (이전 hoche 기준에서 변경).
- PDF 파일명: `{plate}_{date}.pdf`
- 봉인씰: plate + date로 저장.
- 이유: 호차 재정렬 시에도 차량을 정확히 추적.

### 3.3 Hoche 배정 로직 (의도)
1. LS 주문 (ls_orders) 또는 PDF 스캔으로 차량 목록 획득.
2. requestTimeEpoch (또는 파일 mtime) 순으로 정렬.
3. 빈 호차 번호 순으로 1→2→3 배정 (`next_hoche` 방식).
4. 이미 등록된 plate는 기존 hoche 유지.
5. 수동 모달 입력으로 전체 재정렬 가능 (reorder_from_input).

### 3.4 기사명(드라이버) 추출 및 저장 로직 (의도)
**자동 (PDF 경로)**:
- PyMuPDF로 slip PDF 텍스트 추출.
- "성함" 또는 "Name" 다음에 나오는 한글 이름 추출.
- LS orders에 driverName 있으면 우선 사용.
- vehicle_master에 driverName 있으면 fallback.

**수동 (모달 경로)**:
- 차량 순서 입력 텍스트 파싱 (parse_order_line).
- 한글 2~4자 이름 추출 (지역명/회사명 제외).
- reorder_from_input에서 DB 업데이트.

**저장**:
- DepartureRecord.driver_name 에 저장.
- plate + date + hoche 조합으로 관리.

### 3.5 페이지 UI 구성 (의도)
- **헤더 + 날짜 네비게이션**
- **차량 요약 테이블** (hoche 순, plate / driver / phone / time / ton / seals)
- **VF67 카드 그리드** (3열, 차량 상세 정보)
- **봉인씰 입력 패널**
- **차량 순서 입력 모달** (텍스트로 hoche 재배정 + 기사명 입력)
- **인쇄 버튼**: plate로 PDF 찾아 봉인씰 합성 출력
- 데이터 소스: DB(DepartureRecord) 우선 + LS/KPP overlay

### 3.6 데이터 흐름 (의도)
```
LS 다운로드 / PDF 스캔
        ↓
ls_orders_YYYY-MM-DD.json + ls_pdfs/{date}/
        ↓
scan_downloads_folder() → extract_pdf_info()
        ↓
add_vehicle_from_pdf(plate, hoche_override, info["driver"])
        ↓
DepartureRecord (date, hoche, plate, driver_name, ...)
        ↓
views.py load → dashboard.html / React wrapper
        ↓
페이지에 hoche 순으로 표시
```

### 3.7 이전 주요 변경 (의도 반영)
- 2026-07-09: VehicleOrderService 단일 진입점 도입
  - PDF/씰 키를 hoche → plate+date 로 변경
  - 3중 충돌(파서/수동/모달) 제거
- 목적: "오늘 배차 차량이 자동 등록되고, 호차 바뀌어도 정보가 따라가게"

---

## 4. 현재 vs 의도 비교 요약

| 항목              | 현재 상태 (문제)                  | 의도한 상태                     |
|-------------------|----------------------------------|--------------------------------|
| 기사명 추출       | "Name " regex만 → 실패            | "성함\n이름" 또는 여러 패턴 지원 |
| LS driverName     | None                             | LS에서 올바르게 내려와야 함     |
| Master fallback   | 오늘 plate 없음                   | plate 등록 시 driverName 동기화 |
| 2호차 표시        | driver_name = ""                 | PDF/모달에서 추출된 이름 표시   |
| PDF/씰 키         | 부분적으로 plate 사용             | plate + date 완전 적용          |
| 자동 등록         | 차량은 등록되나 기사명 누락       | 차량 + 기사명 + 연락처 모두 자동 |

---

## 5. 참고 파일 (검증된 위치)

- `backend/departure/downloader_parser.py` (extract_pdf_info, scan_downloads_folder)
- `backend/departure/services/vehicle_order.py` (add_vehicle_from_pdf, parse_order_line, assign_hoche)
- `backend/departure/views.py` (데이터 로드)
- `backend/departure/templates/departure/dashboard.html`
- `frontend/client/src/pages/departure-dashboard.tsx`
- `backend/departure/data/ls_orders_2026-07-21.json`
- `backend/departure/data/vehicle_db_merged.json`
- `backend/departure/data/ls_pdfs/2026-07-21/*.pdf`

---

**이 문서는 실제 코드 읽기 + 오늘 데이터 파싱 결과로 작성되었습니다.**

---

## 6. 운영 파이프라인 (의도 vs 구현, 2026-07-21 보강)

### 의도
15:00~ · **10분** 간격 LS 확인 → 배정 차량 등록 → PDF 다운로드 → 봉인 확인 → 인쇄(합성)

### 구현
| 단계 | 구현 |
|------|------|
| LS 감시 | `python ls_automation.py --watch` (기본 10분, 15~23시) 또는 `start_ls_watch.bat` |
| 조회 | Scrapling / curl_cffi + patchright 로그인 |
| PDF | Downloads `LinehaulSlip-*.pdf` |
| 등록 | 다운로드 **직후** `scan_downloads_folder` + 기사명 백필 |
| 서버 동시 기동 | `LS_AUTO_WATCH=1` + `start_server.py` (선택) |
| 봉인·인쇄 | Departure 페이지 수동 확인 후 인쇄 시 합성 |

---

## 7. 수정 이력 (2026-07-21)

### 6.1 기사명 미표시
- **원인**: `extract_pdf_info` 가 `Name 이름` 만 매칭 → 실제 PDF는 `성함\n이종민`
- **수정**: `extract_driver_name()` — `성함` 줄바꿈/공백, `Name`, `기사명` 패턴 지원
- **보정**: `backfill_missing_drivers(date)` — 빈 `driver_name` 을 저장 PDF에서 재추출 (`get_today_order` 시 자동)

### 6.2 인쇄 시 봉인씰 미합성
- **원인1**: 합성 좌표 고정값 `(x, 252)` 가 라벨 행(y≈181)과 어긋남
- **원인2**: 봉인 값이 GET/vehicle 에만 의존해 누락될 수 있음
- **수정**: `compose_seals_on_pdf` — `좌측 윙`/`우측 윙`/`후면 도어` 라벨 오른쪽에 번호 삽입
- **수정**: 인쇄 시 GET → vehicle → `get_seals(plate,date)` 순으로 봉인 확보 후 합성
- **안내**: 봉인 값이 전혀 없으면 원본 PDF 출력 + 토스트 경고
