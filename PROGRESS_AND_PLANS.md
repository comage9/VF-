# VF-new 진행 수정 계획 및 작업 이력

> 최종 업데이트: 2026-07-21
> 작성자: ZCode 에이전트 세션 기록

---

## 목차

1. [트럭 운송비 관리 시스템](#1-트럭-운송비-관리-시스템)
2. [출고 대시보드 차트 개선](#2-출고-대시보드-차트-개선)
3. [출차 관리(departure) 전화번호/차량 등록 문제](#3-출차-관리departure-전화번호차량-등록-문제)
4. [시간별 출고 수량 엑셀 업로드](#4-시간별-출고-수량-엑셀-업로드)
5. [바코드통계 엑셀 업로드 (VF 출고 대시보드)](#5-바코드통계-엑셀-업로드-vf-출고-대시보드)
6. [제품 마스터 페이지 개선](#6-제품-마스터-페이지-개선)
7. [PWA 오프라인 지원 (VPN 끊김 대응)](#7-pwa-오프라인-지원-vpn-끊김-대응)
8. [LS 포털 자동화 (Scrapling/patchright)](#8-ls-포털-자동화-scraplingpatchright)
9. [추후 계획 (Rust/Go 마이그레이션)](#9-추후-계획-rustgo-마이그레이션)
10. [남은 작업 (departure 차량 배차 입력)](#10-남은-작업-departure-차량-배차-입력)

---

## 1. 트럭 운송비 관리 시스템

### 상태: 완료

### 구현 내용

**백엔드 (신규 Django 앱 truck_freight)**
- TruckFreight 모델: 일자, 납품처, 수량, 단위, 운송비, 기사명, 연락처, 계산서 종류, 계좌번호, 입금확인, 비고
- FBV + JsonResponse 패턴 (departure 앱 스타일 준수)
- API 엔드포인트:
  - GET/POST /truck-freight/api/list - 목록 조회/생성
  - PATCH/DELETE /truck-freight/api/detail/<pk> - 수정/삭제
  - GET /truck-freight/api/summary - 월별 추이 + 계산서 종류별 통계
  - POST /truck-freight/api/import - 엑셀 파일 일괄 import

**프론트엔드**
- 사이드바 메뉴 "트럭 운송비" 추가 (제일 아래)
- truck-freight.tsx 페이지: 요약 카드, 월별 추이, 계산서 종류별 현황, 데이터 테이블, 입력/수정 다이얼로그
- truck-freight-api.ts: TanStack Query 훅

**데이터 마이그레이션**
- 기존 엑셀 77건 DB import 완료
- 계산서 종류 통합: '전자 계산서' + '전자 계산서(유원피에스) 예정' 통합
- 계산서 종류 3개로 정리: 유원피에스(46건/56.2%), 보노하우스(17건/29.8%), 일반(13건/14.1%)

### 파일 목록
- backend/truck_freight/ (신규 앱 전체)
- frontend/client/src/components/shared/truck-freight-api.ts (신규)
- frontend/client/src/pages/truck-freight.tsx (신규)
- frontend/client/src/pages/dashboard.tsx (메뉴+라우팅 추가)
- backend/config/settings.py, backend/config/urls.py (앱 등록)

---

## 2. 출고 대시보드 차트 개선

### 상태: 완료

### 구현 내용

**추세선 추가 (금액 기준 선형 회귀선)**
- sales 값들로 최소제곡법 선형 회귀 계산
- 회색 점선으로 표시

**전년 동기 비교 선 그래프 2개**
- 전년 매출액 (보라 점선)
- 전년 출고량 (초록 점선)

**백엔드**
- get_outbound_stats에 전년 동기 집계 로직 추가, prevYearTrend 필드

**프론트엔드**
- 데이터 가공: 추세선 계산 + 전년 병합 (인덱스 기반 매핑)
- 차트 JSX: Line 3개 추가
- CustomTrendTooltip: 깔끔한 2열 표 형태 (반투명 검정 배경)
- Recharts Tooltip을 RechartsTooltip로 수정 (shadcn Tooltip과 이름 충돌 해결)

### 파일 목록
- backend/sales_api/views.py (get_outbound_stats 확장)
- frontend/client/src/components/outbound-dashboard-unified.tsx (차트, 툴팁, 데이터 가공)

---

## 3. 출차 관리(departure) 전화번호/차량 등록 문제

### 상태: 완료

### 문제 원인

**버그 1: PDF 파서가 줄바꿈된 전화번호를 인식 못함**
- LS 운송장 PDF에서 전화번호가 하이픈 뒤 줄바꿈으로 쪼개짐
- 기존 정규식은 한 줄에 있어야 매칭되어 실패

**버그 2: 2070 차량이 마스터 DB에 미등록**
- 경기93아2070 (김희동, 010-5871-3541)이 vehicle_db_merged.json에 없음

**버그 3: processed_slips.json과 DB 불일치**
- 송장번호가 processed_slips에 추가되었지만 DB 저장은 실패/누락
- 이후 자동 스캔이 "이미 처리됨"으로 건너뜀 - 매일 반복되는 문제

### 수정 내역

| 파일 | 수정 |
|------|------|
| downloader_parser.py | 전화번호 정규식을 줄바꿈/공백 허용하도록 변경 |
| vehicle_db_merged.json | 경기93아2070 (김희동, 010-5871-3541) 레코드 추가 |
| vehicle_order.py | 마스터 DB 전화번호 보완 로직 주석 강화 |
| downloader_parser.py | scan_downloads_folder에 DB 검증 로직 추가 |

### DB 검증 로직 (processed_slips DB 동기화)
- processed_slips에 있어도 DB에 없으면 재처리 (누락 복구)
- add_vehicle_from_pdf 실패 시 processed_slips에 추가하지 않음 (재시도 가능)
- 스캔 완료 후 DB에 없는 slip_no를 processed_slips에서 자동 제거

---

## 4. 시간별 출고 수량 엑셀 업로드

### 상태: 완료 (기존 기능 정상 동작 확인)

### 내용
- orderShippedHourlyStatus.xlsx 파일 업로드 기능은 이미 구현되어 정상 동작
- DeliveryDailyRecord 모델 + /api/delivery/import-excel API + "데이터 업로드" 버튼
- 파일에 있는 모든 날짜의 모든 시간대가 자동으로 해당 날짜+시간에 맞춰 저장

---

## 5. 바코드통계 엑셀 업로드 (VF 출고 대시보드)

### 상태: 완료

### 구현 내용

**바코드 매칭 제품명/카테고리 보완**
- BarcodeMaster(830건)에서 제품명 우선 보완
- MasterSpec(1845건)에서 카테고리(category_lg) 보완
- 엑셀의 제품명이 '-'인 행을 DB에서 자동 채움

**box_quantity 설정**
- 재고 대시보드 집계(inventory_unified의 Sum(box_quantity)) 반영

**매출액 추정**
- 과거 OutboundRecord에서 바코드별 평균 단가 산출
- 평균 단가 x 수량으로 매출액 추정 (214/217건 보완, 98.6%)

**토스트 메시지 수정**
- result.count를 result.message 사용

### 파일 목록
- backend/sales_api/views.py (outbound_upload_excel 함수)
- frontend/client/src/components/outbound-tabs.tsx (토스트 메시지)

---

## 6. 제품 마스터 페이지 개선

### 상태: 완료

### 문제
- 1845행이 있었지만 UI가 표시하는 컬럼(영문명/금형/색상/수량)은 전부 빈칸
- 실제 데이터(sku_id, barcode, category_lg, category_md)는 DB에 있었지만 API와 UI에서 숨겨져 있음

### 수정 내용

**백엔드**
- master_specs API GET/POST/PUT 응답에 sku_id, barcode, category_lg, category_md 필드 추가

**프론트엔드** (product-master.tsx 전체 재작성)
- 테이블 컬럼: 제품명, 바코드, SKU ID, 대분류, 중분류
- KPI 카드 4개: 총 제품 수(1,845), 카테고리 수(62), 바코드 보유(1,845), 자동 추출
- 검색 기능 (제품명, 바코드, SKU, 카테고리)
- 페이지네이션 (50행/페이지, 총 37페이지)

### 파일 목록
- backend/sales_api/views.py (master_specs, master_specs_detail)
- frontend/client/src/pages/product-master.tsx (전체 재작성)

---

## 7. PWA 오프라인 지원 (VPN 끊김 대응)

### 상태: 완료

### 목적
- 로컬 컴퓨터에서 VPN으로 전환 시 서버 접속 불가 문제 해결
- 이전에 본 내용이 그대로 표시되도록 (Service Worker 캐싱)

### 구현 내용

**vite-plugin-pwa 설치 및 설정**
- vite.config.ts에 VitePWA 플러그인 추가
- manifest: name, short_name, theme_color(#721FE5), icons
- 캐싱 전략:
  - HTML/CSS/JS/폰트: Precache (빌드 시 자동 캐싱)
  - Google Fonts: CacheFirst (영구 캐싱)
  - API (/api/*): NetworkFirst (5초 타임아웃, 실패 시 캐시)
  - departure/truck-freight API: NetworkFirst

**오프라인 감지 UI**
- offline-banner.tsx: 오프라인 시 상단 주황색 배너 표시
- useOnlineStatus 훅: navigator.onLine + online/offline 이벤트

**Service Worker 등록**
- main.tsx에 registerSW({ immediate: true }) 추가

### 검증 결과
- Service Worker 등록 완료 (dev-sw.js, scope /)
- Manifest 연결 완료
- Precache 24 entries (3,425 KB)

### 파일 목록
- frontend/client/vite.config.ts (VitePWA 설정)
- frontend/client/index.html (PWA 메타 태그)
- frontend/client/src/components/offline-banner.tsx (신규)
- frontend/client/src/App.tsx (OfflineBanner 추가)
- frontend/client/src/main.tsx (SW 등록)
- frontend/client/src/vite-env.d.ts (신규, PWA 타입 선언)
- frontend/client/public/pwa-192x192.png, pwa-512x512.png (신규 아이콘)

---

## 8. LS 포털 자동화 (Scrapling/patchright)

### 상태: 진행 중 (핵심 기능 구현 완료, 통합/스케줄러 검증 중)

### 배경
- LS 포털(ls.coupang.com)에서 매일 수동으로 LinehaulSlip PDF를 다운로드해야 하는 문제
- 과거 ls_query.sh가 쿠키 기반으로 자동화했으나, Akamai Bot Manager 도입으로 차단됨

### 기술 검증 결과

**Scrapling vs patchright**
- Scrapling(스텔스 패처): Akamai 우회 가능하지만 폼 상호작용(로그인) 미지원
- patchright(스텔스 Playwright): Akamai 우회 + 폼 입력/클릭 모두 지원 - 채택
- 일반 Playwright: Access Denied (Akamai가 headless 봇 차단)
- headless=False 모드 필요 (headless=True는 로그인 폼 렌더링 안 됨)

### 구현 내용

**ls_automation.py (신규, 백엔드 루트)**

파이프라인:
1. patchright로 LS 포털 자동 로그인 (Akamai Bot Manager 우회)
2. curl_cffi로 차량 주문 API 호출 (TLS 지문 위장 + 쿠키)
   - 엔드포인트: /data/truckOrderTracking
   - 필터: locationStart=VF67_H, statuses=CONFIRMED,BACK
3. ls_orders_{date}.json 저장 (requestTimeEpoch 포함)
4. 배정된 차량의 LinehaulSlip PDF 다운로드 - Downloads 폴더
5. 기존 downloader_parser.py가 자동 처리

실행 모드:
- python ls_automation.py - 1회 실행
- python ls_automation.py --watch - 정기 실행 (15:00~23:00, 30분 간격)
- python ls_automation.py --date 2026-07-20 - 특정 날짜 지정

**호차 배정 로직 개선 (downloader_parser.py)**

기존: VEHICLE_PREFERRED_HOCHE 하드코딩 (유연성 부족)
신규: requestTimeEpoch 기준 정렬 - 빠른 접안 시간순 1, 2, 3호차

규칙:
- 1차 배차(3대): requestTimeEpoch(접안 시간)순으로 정렬 - 빠른 시간순 1, 2, 3호차
- 추가 배차: 1차 3대 이후 들어오는 것은 시간 상관없이 순서대로 4호, 5호...
- ls_orders_{date}.json에서 truckRequestId로 requestTimeEpoch 조회

검증 결과 (7/20 데이터):
| 호차 | 차량번호 | 기사명 | 접안시간 |
|------|---------|--------|---------|
| 1호차 | 경기95자6464 | 손경준 | 12:20 (1순위) |
| 2호차 | 부산95아2159 | 이수호 | 14:21 (2순위) |
| 3호차 | 광주90바1703 | 김경옥 | 15:30 (3순위) |

### LS 포털 정보
- URL: https://ls.coupang.com/#/orderManagement/truckOrderTracking
- 인증: Keycloak OpenID Connect (ID/비밀번호)
- 안티봇: Akamai Bot Manager (_abck, bm_sv, bm_sz 쿠키)
- 위치 식별자: VF67_H (VF67 유원피에스 HUB)
- 배차 요청: 14:00 (사용자), LS 등록: 15:00경

### 파일 목록
- backend/ls_automation.py (신규, LS 자동화 메인 스크립트)
- backend/departure/downloader_parser.py (requestTime 기반 호차 배정 로직 추가)
- backend/departure/services/vehicle_order.py (add_vehicle_from_pdf에 hoche_override 파라미터 추가)
- backend/.env (LS_ID, LS_PASSWORD 추가)

---


---

## 9. KPP 파렛트 자동화 (WPPS / PBM)

### 상태: 진행 시작

### 배경
- KPP WPPS (로지스올)에서 PBM110MW (납품/반납요청), PBM140MW (출하통보) 수동 작업
- 팔레트 조회/등록/EDI 자동화 필요 (VF 출차와 연동)
- LS와 유사하게 Akamai/봇 차단 대응 필요

### 계획 (Scrapling/patchright 하이브리드)
1. KPP WPPS 로그인 (patchright 또는 scrapling stealth)
2. PBM110MW 조회/신규등록 자동화 (차량/수량/하차지)
3. PBM140MW 출하통보 등록 (EDI)
4. VF-new departure/ inventory와 연동 (팔레트 재고 반영)
5. --watch 모드 또는 cron

### 구현 예정 파일
- backend/kpp_automation.py (신규)
- .env (KPP_USERNAME, KPP_PASSWORD)
- 기존 kpp-pallet-management 스킬 연동

### 현재 상태
- VF-new 내 KPP 관련 코드 없음 (Hermes 스킬만 존재)
- LS 자동화 패턴 재사용하여 KPP용 스크립트 작성 시작
- Scrapling hybrid 적용

---
## 9. 추후 계획 (Rust/Go 마이그레이션)

### 상태: 보류 (추후 검토)

### 배경
- Mojo 변환 가능성 검토 - 불가능 (웹 프레임워크, ORM, 생태계 부재)
- 대안: Python 유지 + 성능 핫스팟만 Rust/Go로 점진적 교체

### 계획
| 우선순위 | 내용 |
|---------|------|
| 1순위 | 무거운 연산(Prophet 예측, fill_outbound_estimates) Rust/Go 마이크로서비스 분리 |
| 2순위 | pandas Polars(Rust 기반) 교체로 데이터 처리 5~10배 향상 |
| 3순위 | uv 패키지 매니저, Ruff 린터 도입으로 개발 환경 개선 |
| 시기 | 현재 기능 개발 완료 후, 성능 병목이 실제로 발생할 때 |

참고: "Rust + Mojo Are Quietly Replacing Python in AI" 영상 분석 기반
- Python은 유지 (운전대), 성능 엔진만 Rust/Go로 교체

---

## 10. 남은 작업 (departure 차량 배차 입력)

### 상태: 일부 진행 중

### 문제
- 사용자가 배차 정보를 입력할 때 "수배중" 호차 처리가 안 됨
- applyVehicleOrder JS 함수가 기존 호차 항목만 업데이트, 신규 생성 안 함

### 진행 상황
- 중복 HTML 버튼 제거 완료 (dashboard.html 365~369행)
- applyVehicleOrder 수정 및 "수배중" 입력 형식 지원: 미완료

### 남은 작업
1. applyVehicleOrder: 호차 기존 항목 없을 때 새 항목 생성 + "수배중" 처리
2. 차량 순서 입력 모달: "수배중" 입력 형식 안내 추가
3. PDF 정보와 배차 입력 매칭 (기사명/전화번호/봉인씰 자동 채움)
4. 검증: "수배중" 포함 배차 입력 - 호차별 배정 확인

---

## 프로젝트 구조 요약

```
VF-new/
+-- backend/
|   +-- config/                 # Django 설정
|   +-- sales_api/              # 메인 API (생산, 출고, 재고, AI)
|   +-- departure/              # 출차 관리 (PDF 파싱, 차량 DB)
|   +-- truck_freight/          # 트럭 운송비 (신규)
|   +-- ls_automation.py        # LS 포털 자동화 (신규)
|   +-- .env                    # 환경 변수 (LS_ID, LS_PASSWORD 포함)
+-- frontend/client/
|   +-- src/
|   |   +-- pages/              # 페이지 컴포넌트
|   |   +-- components/         # UI 컴포넌트
|   +-- public/                 # 정적 파일 (PWA 아이콘 포함)
|   +-- vite.config.ts          # Vite + PWA 설정
+-- docs/                       # 문서
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Django 5.2 + DRF + PostgreSQL |
| 프론트엔드 | React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS |
| 차트 | Recharts 2.8 |
| PWA | vite-plugin-pwa (Workbox) |
| LS 자동화 | patchright (스텔스 Playwright) + curl_cffi |
| AI | OpenRouter (무료 모델) |
| 상태 관리 | TanStack Query (React Query) |

---

*이 문서는 ZCode 에이전트 세션에서 진행한 작업과 향후 계획을 기록한 것입니다.*
