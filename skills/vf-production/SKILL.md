---
name: vf-production
description: 보노하우스 VF 생산 계획 관리 에이전트. 생산 계획 실시간 조회, 추가, 수정, 삭제, 복사. 기계별/날짜별/제품별 관리. 제품 별명(토이, 로코스, 모던플러스, 이유, 해피, 어반, 슬림, 와이드, 에센셜, 북트롤리, 탑백, 초대형, 맥스, 바퀴, 데크타일, 핸들러) 인식. 트리거: 생산, 기계, 계획, production, bonohouse, 보노하우스, 토이, 로코스, 해피, 어반, 슬림, 와이드, 에센셜, 북트롤리, 탑백, 초대형, 맥스, 데크타일, 핸들러.
---

# VF 보노하우스 생산 계획 관리

## 시스템 개요

- **프론트엔드**: http://bonohouse.p-e.kr:5174 (React + Vite)
- **백엔드 API**: http://bonohouse.p-e.kr:5174/api (Django REST, 5176에서 프록시)
- **GitHub**: https://github.com/comage9/VF-.git
- **로컬 소스**: `coding/VF-/`

## API 엔드포인트

### 조회
- `GET /api/production` → 전체 + 최신 날짜 데이터
- `GET /api/production/template` → CSV 템플릿 다운로드
- `GET /api/master/specs` → 제품 마스터 스펙 (금형-제품 매핑)

### 추가/수정/삭제
- `POST /api/production-log` → 생산 계획 추가 (body: record 객체)
- `PUT /api/production-log/{id}` → 특정 계획 수정
- `DELETE /api/production-log/{id}` → 특정 계획 삭제
- `DELETE /api/production-log/{date}` → 특정 날짜 전체 삭제
- `DELETE /api/production-log` (body: `{type:"ids", ids:[...]}`) → 다건 삭제

### 상태 관리
- `POST /api/production/bulk-status` → 상태 일괄 변경
  - body: `{status: "pending|in_progress|completed", ids:[...] / date:"..." / scope:"all"}`

### 파일/복사
- `POST /api/upload-production-file` → 엑셀 업로드
- `POST /api/production/copy-day` → MachinePlan 복사 (ProductionLog 아님)
  - body: `{from_date: "...", to_date: "..."}`

## 데이터 구조 (ProductionLog)

```json
{
  "id": 831,
  "date": "2026-04-06",
  "machineNumber": "4",
  "moldNumber": "2",
  "productName": "모던플러스 서랍",
  "productNameEng": "Modern Plus Drawer(...)",
  "color1": "WHITE1",
  "color2": "WHITE 180",
  "unit": "125",
  "quantity": 1,
  "unitQuantity": 125,
  "total": 125,
  "status": "pending",
  "startTime": null,
  "endTime": null
}
```

## 기계-금형-제품 매핑 (주요)

| 기계 | 금형 | 제품 |
|------|------|------|
| 1 | 56 | 바퀴 |
| 2 | 60/62 | 리빙카트 바퀴 |
| 3 | 3 | 모던플러스 블랑 |
| 3 | 17 | 토이 바디 |
| 3 | 121 | 탑백 72L |
| 4 | 2 | 모던플러스 서랍 |
| 5 | 101 | 신규 모던플러스 프레임 |
| 6 | 5 | 모던플러스 앞판 |
| 7 | 901 | 슬림 서랍장 프레임 신규 |
| 8 | 135 | 이유 |
| 8 | 801 | 슬림 서랍장 서랍 신규 |
| 9 | 32 | 와이드 서랍 |
| 9 | 36 | 슬림형 서랍 |
| 9 | 41/42 | 로코스 M/S |
| 10 | 111 | 어반 옷걸이 |
| 10 | 112 | 어반 와이드 옷걸이 |
| 10 | 114 | 데크타일 |
| 11 | 135 | 이유 |
| 12 | 40 | 로코스 L |
| 12 | 99 | 옷정리 트레이 |
| 13 | 12 | 초대형 바디 |
| 13 | 14 | 해피 바디 |
| 13 | 127/128 | 북트롤리 |
| 14 | 31 | 와이드 프레임 |
| 14 | 118 | 맥스 서랍장 서랍 |

전체 목록은 `GET /api/master/specs`로 확인.

## 주요 컬러 코드

- WHITE1 / WHITE 180
- Ivory / IVORY 1060
- Butter / YELLO - 3093
- Gray1 / GRAY 9097, Gray2 / GRAY 11215-1
- Black / -
- NAVY1 / GRAY 9091
- Violet / VIOLET 8176
- Modern Blue(B3) / BLUE 2083
- Pink(P3) / PINK 6078

## 상태값

- `pending` (대기)
- `in_progress` (진행중)
- `completed` (완료)

## 실시간 데이터 조회 스크립트

`scripts/fetch-production.sh`로 API 데이터 조회:

```bash
scripts/fetch-production.sh today          # 오늘 생산 계획
scripts/fetch-production.sh latest         # 최신 날짜 생산 계획
scripts/fetch-production.sh date 2026-04-06 # 특정 날짜
scripts/fetch-production.sh product 토이    # 제품명 검색
scripts/fetch-production.sh machine 3      # 기계번호별
scripts/fetch-production.sh specs          # 마스터 스펙
scripts/fetch-production.sh summary        # 전체 요약
```

## 제품 별명 매핑 (즉시 인식)

| 별명 | 정식명 | 기계 | 금형 |
|------|--------|------|------|
| 토이 | 토이 바디 | 3 | 17 |
| 로코스 | 로코스 M/S/L | 9(M,S), 12(L,M), 11(S) | 41/42, 40 |
| 모던플러스 | 서랍/앞판/블랑/프레임 | 3~6 | 각각 |
| 이유 | 이유 | 8, 11 | 135 |
| 해피 | 해피 바디/캡/프레임 | 13, 9~11, 14 | 14, 901 |
| 어반 | 어반 옷걸이/와이드 | 10, 11 | 111, 112 |
| 슬림 | 슬림 서랍장 프레임/서랍 | 7, 8, 9 | 801, 901 |
| 와이드 | 와이드 서랍/프레임/앞판 | 9, 13, 14 | 31 |
| 에센셜 | 에센셜 서랍/앞판/프레임 | 11~14 | - |
| 북트롤리 | 상판/중간판/하판 | 9, 12~14 | 127/128 |
| 탑백 | 탑백 72L | 3 | 121 |
| 초대형 | 초대형 바디/캡 | 13, 14 | 12 |
| 맥스 | 맥스 서랍장 | 13, 14 | 118 |
| 바퀴 | 바퀴 | 1 | 56 |
| 데크타일 | 데크타일 | 10, 11 | 114 |
| 핸들러 | 핸들러 바스켓 S/M/L | 9~11 | - |

## 작업 패턴

### 제품 조회
사용자가 "토이 생산 어때" 또는 "기계 3번 뭐해"라고 하면:
1. `scripts/fetch-production.sh product 토이` 또는 `machine 3` 실행
2. 결과를 요약해서 응답

### 날짜 복사 (ProductionLog)
copy-day API는 MachinePlan 모델용. ProductionLog 복사는:
1. `GET /api/production` → 원본 날짜 데이터 필터
2. 각 record에 대해 `POST /api/production-log` (date만 변경)

### 제품 추가
사용자가 "기계3번에 토이 아이보리 한 팔레트"라고 하면:
1. 별명 매핑으로 제품 정보 확인 (토이 바디, 금형 17)
2. `POST /api/production-log`로 추가

### 제품 삭제
사용자가 기계번호 + 제품명 + 색상으로 지정하면:
1. `GET /api/production` → 조건에 맞는 record 찾기
2. `DELETE /api/production-log/{id}`

## 참고 자료

- 전체 생산 이력 요약 (제품별 빈도, 기계별 제품, 날짜별 건수): `references/production-summary.md`
