# BONO PMS — 통합 운영 관리 시스템

> **버전:** v2.1 | **최종 수정:** 2026-03-24  
> **아키텍처:** Static HTML + Vanilla JS (프론트엔드 전용)  
> **의존 API 서버:** `http://bonohouse.p-e.kr:5174` (Django REST Framework)

---

## 📁 프로젝트 구조

```
/
├── index.html          # 통합 대시보드 (VF 출고 + PMS 생산 통합)
├── outbound.html       # 출고 분석 (추세·상품 순위·목록)
├── delivery.html       # 배송 관리 (출고 내역·상세 드로어)
├── inventory.html      # 재고 현황 + 입고 가능 수량 (2탭)
├── production.html     # 일별 생산계획 CRUD
├── history.html        # 생산 이력 조회
├── molds.html          # 금형 마스터 관리
├── colors.html         # 색상/단위 관리
├── machines.html       # 기계 설비 관리
├── css/
│   └── style.css       # 공통 디자인 시스템
└── js/
    └── common.js       # 공통 유틸리티 (v2.1)
```

---

## ✅ 구현된 기능

### 통합 대시보드 (`index.html`)
- VF 출고 KPI (30일 출고량, 매출액, 일평균, 재고경보)
- 출고 추세 라인차트 (수량 + 매출 듀얼 Y축)
- 출고량 TOP 5 순위
- 재고 상태 경보 (소진/부족/정상/총량)
- PMS 생산 KPI (계획건수, 진행중, 완료, 총수량, 금형수)
- 상태별 도넛차트, 제품별 바차트, 기계 현황 타일, 최근 계획 테이블

### 출고 분석 (`outbound.html`)
- 기간 선택 (7/30/60/90/180/365일) + 일별/주별/월별 그룹핑
- 5개 차트: 출고추세(복합), 카테고리파이, 요일패턴, 매출추세, 성장률
- TOP 10 상품 순위 (수량/매출 전환)
- 출고 목록 (검색·카테고리·상태 필터 + 페이지네이션)
- CSV 내보내기

### 배송 관리 (`delivery.html`)
- 오늘 출고 KPI 5종
- 카테고리별 바차트 + 단가대별 도넛차트
- 날짜범위·검색·상태·카테고리 필터
- 행 클릭 → 우측 상세 드로어 (바코드 시각화 포함)
- CSV 내보내기

### 재고 현황 (`inventory.html`)
- **탭1 재고현황:** SKU 수·정상·부족·소진 KPI, 상태분포 도넛, 카테고리별 바차트, 재고 게이지 바 테이블, 상세 드로어
- **탭2 입고 가능 수량:** 발주서 업로드(xlsx/csv), 포함 주문상태 정책 관리, 목표재고 기준(min/max) 전환, 입고가능 수량 계산 테이블

### 생산 관리 (`production.html`)
- 일별 생산계획 CRUD (등록/수정/삭제)
- 기계번호, 금형, 제품명(KR/EN), 색상, 수량, 상태 관리

### 마스터 관리
- `history.html`: 생산 이력 조회·필터
- `molds.html`: 금형 마스터 CRUD
- `colors.html`: 색상·단위 CRUD
- `machines.html`: 기계 설비 CRUD

---

## 🛠️ v2.1 수정 내역 (2026-03-24)

### 🔴 버그 수정
| 파일 | 수정 내용 |
|------|----------|
| `inventory.html` | 입고 가능 수량 계산 로직 수정 (`receivedQty > 0` 잘못된 분기 → `confirmed - received - currentStock` 공식) |
| `inventory.html` | 페이지네이션 클로저 버그 수정 (화살표 함수 toString 직렬화 → 전역 함수 `goInvPage`, `goIbPage` 분리) |
| `delivery.html` | 날짜 비교 오류 수정 (`r.outbound_date === today` → normalizeOutbound 후 `r.outboundDate` 사용) |
| `delivery.html` | 드로어 내 `r.notes` 미사용 필드 제거, `logisticsCenter` 폴백 추가 |
| `outbound.html` | 카테고리 차트 더미 데이터 완전 제거 (실제 데이터만 표시) |
| 전체 | Chart.js 인스턴스 전역 `charts{}` → `ChartManager` 싱글톤으로 통일 |

### 🟡 기능 개선
| 파일 | 개선 내용 |
|------|----------|
| `js/common.js` | `normalizeOutbound()` 추가 — camelCase/snake_case 혼용 필드 정규화 |
| `js/common.js` | `ChartManager` 싱글톤 추가 — destroy/set/get/destroyAll |
| `js/common.js` | `renderPaginationEl()` 개선 — 함수명 문자열 방식으로 클로저 버그 방지 |
| `outbound.html` | `loadData()` dailyTrend 폴백 (`data.trend`) 추가 |
| `outbound.html` | `loadTopProducts()` 응답 배열/객체 양쪽 지원 |
| `index.html` | TOP 5 상품 `productName`/`name` 양쪽 필드 지원 |
| `index.html` | 재고 데이터 `invData`가 배열/객체 양쪽 대응 |

---

## 🌐 API 엔드포인트

### VF (출고·재고·입고)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/outbound/stats?days=30&groupBy=day` | 출고 통계 + 일별 추이 |
| `GET /api/outbound?days=30&limit=500` | 출고 목록 |
| `GET /api/outbound/top-products?days=30&limit=10` | 상위 상품 |
| `GET /api/inventory/unified?limit=2000` | 통합 재고 목록 |
| `GET /api/inventory/inbound/latest` | 최신 발주 데이터 |
| `GET /api/inventory/inbound/policy` | 발주 상태 정책 |
| `POST /api/inventory/inbound/upload` | 발주서 파일 업로드 |

### PMS (생산관리 — Tables API)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST tables/production_plans` | 생산계획 CRUD |
| `GET/POST tables/molds` | 금형 마스터 |
| `GET/POST tables/machines` | 기계 설비 |
| `GET/POST tables/colors` | 색상 마스터 |

---

## ⚠️ 배포 시 주의사항

### Mixed Content (HTTPS ↔ HTTP)
현재 VF API 서버(`bonohouse.p-e.kr:5174`)는 HTTP입니다.  
이 HTML을 **HTTPS 도메인**에 배포하면 브라우저가 API 호출을 차단합니다.

**해결 방법 (3가지 중 선택):**
1. **API 서버에 SSL 인증서 적용** (Let's Encrypt + Nginx)
2. **Nginx 리버스 프록시로 HTTPS → HTTP 변환**
3. **같은 도메인 HTTP로 배포** (현재 `bonohouse.p-e.kr` 서버에 직접 배포)

### Git 업로드 방법
```bash
# 1. Publish 탭에서 ZIP 다운로드
# 2. 로컬에서:
git clone https://github.com/comage9/VF-.git
cd VF-
# 3. 새 폴더로 HTML 파일들 복사 후:
git add .
git commit -m "feat: static HTML PMS+VF dashboard v2.1 - bug fixes"
git push origin main
```

### GitHub Pages 실행
- GitHub Pages는 HTTPS → 위의 Mixed Content 문제 발생
- 별도 HTTPS 설정 없이는 API 데이터 로드 불가

---

## 🔮 다음 단계 권장 개선사항

| 우선순위 | 항목 |
|----------|------|
| 🟡 | Nginx HTTPS 리버스 프록시 설정으로 Mixed Content 해결 |
| 🟡 | 물류센터(logisticsCenter) 필터 추가 (`outbound.html`, `delivery.html`) |
| 🟡 | 업로드 이력 관리 개선 (최신 1건 → 전체 이력 표시) |
| 🟢 | FC 입고 데이터 소스 탭 (`outbound.html`) |
| 🟢 | 재고 설정 인라인 편집 (`inventory.html`) |
| 🔵 | AI 분석 리포트 연동 (`/ai-analysis` 엔드포인트) |
