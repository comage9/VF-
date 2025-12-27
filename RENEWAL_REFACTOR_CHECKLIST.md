# 리뉴얼 수정·보완·개선 체크리스트 (backend Django + frontend React/Node 기준)

## 목차
1. [범위/원칙 (결정사항)](#1-범위원칙-결정사항)
2. [목표 아키텍처 정의](#2-목표-아키텍처-정의-최종-형태)
3. [Phase 0 — 포트/실행 기준 정리](#3-phase-0--포트실행-기준-정리-05~1일)
4. [Phase 1 — Node API를 "프록시 전용"으로 통일](#4-phase-1--node-api를-프록시-전용으로-통일-1~2일-✅-최우선)
5. [Phase 2 — Django 모델/API 통합](#5-phase-2--django-모델api-통합진짜-db-통합-2~5일)
6. [Phase 3 — 보안/운영 설정 정리](#6-phase-3--보안운영-설정-정리-1~3일)
7. [Phase 4 — 테스트/검증 자동화](#7-phase-4--테스트검증-자동화최소-세트-지속)
8. [운영/배포 체크리스트](#8-운영배포-체크리스트간단)
9. [리스크/주의사항](#9-리스크주의사항)
10. [최종 확인 질문](#10-최종-확인-질문작업-착수-전-3분-점검)

---

## 1. 범위/원칙 (결정사항)

### 1.1 기준 코드
- **Backend**: `Current_Project/backend` (Django)
- **Frontend**: `Current_Project/frontend` (React + Vite + Node/Express TS 서버)

### 1.2 참고 전용(비작업 대상)
- `Current_Project/analytics-dashboard-main - 복사본`

### 1.3 외부 서비스 포트(단일)
- **`5175`** (브라우저 접속/Node 서버 포트)

### 1.4 DB 통합 목표
- 모든 데이터는 **Django DB(SQLite → 필요 시 Postgres)** 로 통합
- Node는 DB를 직접 읽지 않으며 **API는 Django가 단일 Source of Truth**

### 1.5 완료 상태 요약
- 완료: 체크리스트를 더 세분화한 문서를 작성했고, 지정 경로에 파일로 저장했으며 파일명/경로를 안내했습니다.

---

## 2. 목표 아키텍처 정의 (최종 형태)

- **Node(frontend/server)**
  - React 정적 서빙(개발: Vite middleware / 운영: 빌드 산출물)
  - `/api/*` 요청은 **Django로 reverse proxy**
  - 업로드가 필요한 경우:
    - Node가 multipart를 수신 → Django에 전달 → Django가 파싱/저장/검증
- **Django(backend)**
  - `/api/*` 최종 처리
  - 데이터 저장/집계/검증의 단일 책임

**완료 조건(Exit Criteria)**
- 브라우저는 `http://localhost:5175`만 접근
- 프론트에서 호출하는 `/api/*`는 “Node 내부 구현” 없이 **Django 응답을 그대로 받음**
- 어떤 기능도 JSON 파일/로컬 sqlite/별도 DB를 추가로 사용하지 않음

---

## 3. Phase 0 — 포트/실행 기준 정리 (0.5~1일)

### 2.1 Node 서버 기본 포트 5175 고정
- **대상 파일**: `frontend/server/index.ts`
- **체크 항목**
  - `process.env.PORT`가 없을 때 기본값이 `5175`인지 확인/수정
  - 실행 문서(README 등)가 `5175`로 맞춰져 있는지 확인

**완료 조건**
- `PORT` 미설정 시 Node가 `5175`로 정상 구동

### 2.2 Django 내부 포트/주소를 환경변수화
- **대상 파일**
  - `frontend/server/routes.ts` (현재 하드코딩된 Django URL 존재)
- **체크 항목**
  - Django base URL을 `.env`로 분리
    - 예: `DJANGO_BASE_URL=http://localhost:8000` (내부용)
  - Node는 해당 값을 읽어 proxy 대상으로 사용

**완료 조건**
- 코드에 `http://localhost:8000` 같은 문자열이 상수로 박히지 않음

---

## 4. Phase 1 — Node API를 "프록시 전용"으로 통일 (1~2일)  ✅ 최우선

> 리뉴얼 핵심: Node에서 직접 `storage.*`/`DeliveryDatabase` 등을 호출하여 데이터를 만들거나 저장하지 않도록 제거/전환.

### 3.1 Node에서 “직접 응답하는” API 제거/전환
- **대상 파일**: `frontend/server/routes.ts`, `frontend/server/storage.ts`, `frontend/server/delivery-database.ts`

#### 3.1.1 Outbound
- **체크 항목**
  - Node가 `storage.getOutboundRecords()`로 응답하는 `GET /api/outbound` 제거
  - Node의 `GET /api/outbound/meta`가 더미값을 반환하는 부분 제거 또는 Django로 이관
  - `GET /api/outbound/stats`는 이미 Django로 프록시 중 → 이 방식 유지/정리

**완료 조건**
- Node 서버에서 `/api/outbound*`는 모두 Django로 전달(프록시)

#### 3.1.2 Inventory
- **체크 항목**
  - Node가 `storage.getInventoryItems()` 등으로 직접 반환하는 `/api/inventory*` 제거
  - `GET /api/inventory/integrated`(통합 재고)도 Django로 이관

**완료 조건**
- `/api/inventory*`는 Django가 처리

#### 3.1.3 Delivery
- **체크 항목**
  - `DeliveryDatabase` 기반 저장/조회 제거(또는 read-only 임시 유지 시 “dev 전용”으로 격리)
  - `POST /api/delivery/import-excel`은 Node→Django 파싱→Django 저장 구조로 통일
  - `/api/delivery/hourly` 라우트 중복 정의 제거

**완료 조건**
- 배송 관련 데이터는 Django 모델에 저장되고, 조회도 Django API에서만 수행

#### 3.1.4 BACO
- **체크 항목**
  - 현재 Node에서 `transfer_stats.json`로 저장/집계하는 로직 제거
  - Django 모델로 이관(전송 내역/집계 결과)

**완료 조건**
- 바코드 전송/집계 데이터는 Django DB에만 존재

### 3.2 Node 라우팅 구조 정리(중복/충돌 제거)
- **대상 파일**: `frontend/server/routes.ts`
- **체크 항목**
  - 동일 endpoint가 파일 내에서 2번 이상 선언되지 않도록 정리
  - `fs` import 중복(동일 이름) 제거
  - 임시/디버그 로그(예: "REGISTERING ROUTES - DEBUG")는 `NODE_ENV !== 'production'`에서만 출력

**완료 조건**
- `/api/*`는 proxy middleware가 단일 책임을 가지며, 라우트 중복이 없음

### 3.3 프록시 구현 방식 표준화
- **체크 항목**
  - `http-proxy-middleware` 또는 단일 fetch 프록시 중 하나로 통일
  - 에러 시 응답 표준화
    - `{ status: 'error', message: '...' }` 또는 최소 `{ message: '...' }`

**완료 조건**
- 프록시 에러가 “조용히 200 OK”로 내려가지 않음

---

## 5. Phase 2 — Django 모델/API 통합(진짜 DB 통합) (2~5일)

### 4.1 모델 확장 계획
- **현존 모델**: `OutboundRecord`, `InventoryItem`, `DataSource`
- **추가 필요 후보(권장)**
  - **DeliveryDaily**: 날짜별 총량/평균/예측값(옵션)
  - **DeliveryHourlyCumulative**: 날짜별 시간대 누적(프론트 그래프용)
  - **BarcodeTransfer / BarcodeMaster / BarcodeEvent**: BACO 관련 최소 스키마

**완료 조건**
- Node의 파일/로컬 DB 기반 데이터가 Django 모델로 대체됨

### 4.2 마이그레이션 커맨드 정비
- **대상 파일**: `backend/sales_api/management/commands/import_legacy_db.py`
- **체크 항목**
  - UUID 저장 포맷을 Django UUIDField와 일치시키도록 정리(36자 하이픈 포함 권장)
  - dry-run 옵션(가능하면) 또는 검증 로그(레코드수/샘플) 추가
  - 마이그레이션 후 검증 절차 문서화

**완료 조건**
- 마이그레이션 1회 수행으로 기존 데이터가 Django DB로 이관되고 무결성 확인 가능

### 4.3 API 응답/검색/집계 일관성
- **대상 파일**: `backend/sales_api/views.py`, `serializers.py`, `urls.py`
- **체크 항목**
  - `backend/sales_api/urls.py`에서 `outbound/stats` 중복 정의 제거
  - Outbound list의 paging 정책 결정
    - 프론트 호환이 필요하면: list는 배열로 유지하되 stats는 별도 유지
  - `get_outbound_stats`에서 groupBy(day/week/month) 성능 테스트

**완료 조건**
- 동일 API가 환경에 따라 다른 구조로 내려오지 않음

---

## 6. Phase 3 — 보안/운영 설정 정리 (1~3일)

### 5.1 Django settings 보안 필수 항목
- **대상 파일**: `backend/config/settings.py`
- **체크 항목**
  - `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` 환경변수화
  - `CORS_ALLOW_ALL_ORIGINS=True` 제거 → 허용 origin 명시
  - 운영 모드에서 디버그 정보/스택트레이스 외부 노출 금지

**완료 조건**
- 운영 배포 시 하드코딩된 SECRET이 존재하지 않음

### 5.2 Node 서버 보안/정합성
- **대상 파일**: `frontend/server/index.ts`, `frontend/server/routes.ts`
- **체크 항목**
  - CORS `*`가 불필요하면 제거(동일 오리진 구성 시)
  - health check에서 조작된 지표(`errorRate: 0`) 제거 또는 dev 전용화

**완료 조건**
- 운영 환경에서 의도치 않은 외부 접근/오염 가능성이 줄어듦

---

## 7. Phase 4 — 테스트/검증 자동화(최소 세트) (지속)

### 6.1 Django API 스모크 테스트(권장)
- **pytest 기준** (프로젝트 규칙)
- **최소 케이스**
  - `GET /api/outbound?start&end`
  - `GET /api/outbound/stats?start&end&groupBy=day`
  - `POST /api/outbound/bulk` (샘플 10건)
  - `POST /api/parse-excel-delivery` (샘플 파일)

### 6.2 Node 프록시 스모크 테스트
- **최소 케이스**
  - `5175`로 접속 시 index.html 정상
  - `/api/outbound/stats`가 Django 결과를 그대로 반환

**완료 조건**
- 리뉴얼 중 수정으로 API/프록시가 깨지면 즉시 감지 가능

---

## 8. 운영/배포 체크리스트(간단)

- **환경변수**
  - Node
    - `PORT=5175`
    - `DJANGO_BASE_URL=http://localhost:8000` (내부)
  - Django
    - `DEBUG=false`
    - `SECRET_KEY=...`
    - `ALLOWED_HOSTS=...`
    - `CORS_ALLOWED_ORIGINS=...`
- **로그**
  - 민감 정보(API 키, URL querystring 등) 로그에 남지 않도록 점검

---

## 9. 리스크/주의사항

- **라우트 중복**(특히 `frontend/server/routes.ts`)은 “동작은 되지만 일부 기능이 영원히 호출되지 않는” 형태의 장애를 만들 수 있음
- **DB 통합** 과정에서 가장 흔한 문제는 날짜/UUID/금액(Decimal) 변환 오류
- **Django 버전 표기**(현재 `requirements.txt`의 `Django==6.0`)는 설치/호환성 측면에서 재검증 필요

---

## 10. 최종 확인 질문(작업 착수 전 3분 점검)

- Node에서 DB를 직접 읽는 코드가 남아있는가?
- `/api/*`가 Django로 프록시되는가?
- 어떤 데이터도 JSON/별도 sqlite 파일에 쓰지 않는가?
- 외부 접속 포트가 5175로 고정되어 있는가?

---

## 11. 진행 상태 추적 표

| 단계 | 항목 | 상태 | 담당자 | 완료일 | 비고 |
|------|------|------|--------|--------|------|
| Phase 0 | Node 서버 기본 포트 5174 고정 | | | | |
| Phase 0 | Django 내부 포트/주소 환경변수화 | | | | |
| Phase 1 | Outbound API 제거/전환 | | | | |
| Phase 1 | Inventory API 제거/전환 | | | | |
| Phase 1 | Delivery API 제거/전환 | | | | |
| Phase 1 | BACO API 제거/전환 | | | | |
| Phase 1 | Node 라우팅 구조 정리 | | | | |
| Phase 1 | 프록시 구현 방식 표준화 | | | | |
| Phase 2 | 모델 확장 계획 | | | | |
| Phase 2 | 마이그레이션 커맨드 정비 | | | | |
| Phase 2 | API 응답/검색/집계 일관성 | | | | |
| Phase 3 | Django settings 보안 필수 항목 | | | | |
| Phase 3 | Node 서버 보안/정합성 | | | | |
| Phase 4 | Django API 스모크 테스트 | | | | |
| Phase 4 | Node 프록시 스모크 테스트 | | | | |

---

## 12. 상세 구현 가이드

### 12.1 Phase 0 상세 구현

#### 12.1.1 Node 서버 포트 설정 예시
```typescript
// frontend/server/index.ts
const PORT = process.env.PORT || 5175;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

#### 12.1.2 Django URL 환경변수화 예시
```typescript
// frontend/server/routes.ts
const DJANGO_BASE_URL = process.env.DJANGO_BASE_URL || 'http://localhost:8000';

// 프록시 설정
app.use('/api', createProxyMiddleware({
  target: DJANGO_BASE_URL,
  changeOrigin: true
}));
```

### 12.2 Phase 1 상세 구현

#### 12.2.1 Outbound API 전환 예시
```typescript
// 기존 코드 (제거 대상)
app.get('/api/outbound', (req, res) => {
  const records = storage.getOutboundRecords();
  res.json(records);
});

// 변경 후 코드
app.get('/api/outbound', createProxyMiddleware({
  target: DJANGO_BASE_URL,
  pathRewrite: {
    '^/api/outbound': '/api/sales/outbound'
  }
}));
```

#### 12.2.2 라우트 중복 확인 방법
```bash
# Node 서버 실행 시 라우트 로그 확인
DEBUG=express:* npm run dev

# 또는 코드 내에서 확인
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(r.route.path)
  }
})
```

### 12.3 Phase 2 상세 구현

#### 12.3.1 Django 모델 확장 예시
```python
# backend/sales_api/models.py
class DeliveryDaily(models.Model):
    date = models.DateField()
    total_quantity = models.IntegerField()
    average_quantity = models.FloatField()
    predicted_quantity = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class DeliveryHourlyCumulative(models.Model):
    date = models.DateField()
    hour = models.IntegerField()
    cumulative_quantity = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
```

#### 12.3.2 마이그레이션 커맨드 개선 예시
```python
# backend/sales_api/management/commands/import_legacy_db.py
from django.core.management.base import BaseCommand
import json
from sales_api.models import OutboundRecord
import uuid

class Command(BaseCommand):
    help = 'Import legacy data to Django models'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Run without making changes')
        parser.add_argument('--source', type=str, help='Source file path')

    def handle(self, *args, **options):
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Running in dry-run mode'))
        
        # 실제 마이그레이션 로직
        # UUID 형식 표준화 (36자 하이픈 포함)
        # 데이터 검증 및 변환
```

### 12.4 Phase 3 상세 구현

#### 12.4.1 Django settings 보안 설정 예시
```python
# backend/config/settings.py
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ.get('SECRET_KEY')
DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',')

# CORS 설정
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')

# 운영 환경에서 디버그 정보 제한
if not DEBUG:
    LOGGING = {
        'version': 1,
        'disable_existing_loggers': False,
        'handlers': {
            'file': {
                'level': 'INFO',
                'class': 'logging.FileHandler',
                'filename': 'django.log',
            },
        },
        'loggers': {
            'django': {
                'handlers': ['file'],
                'level': 'INFO',
                'propagate': True,
            },
        },
    }
```

#### 12.4.2 Node CORS 설정 예시
```typescript
// frontend/server/index.ts
import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : ['http://localhost:5175'],
  credentials: true
};

app.use(cors(corsOptions));
```

---

## 13. 문제 해결 가이드

### 13.1 일반적인 문제 및 해결책

| 문제 | 원인 | 해결책 |
|------|------|--------|
| 프록시 요청 실패 | Django 서버가 실행되지 않음 | Django 서버 실행 상태 확인 |
| CORS 오류 | 허용된 오리진 목록에 없음 | CORS 설정 확인 |
| 라우트 중복 오류 | 동일한 경로가 여러 번 정의됨 | 라우트 정리 |
| DB 마이그레이션 실패 | 데이터 형식 불일치 | 데이터 형식 표준화 |
| 포트 충돌 | 다른 프로세스가 포트 사용 | 포트 확인 및 프로세스 종료 |

### 13.2 디버깅 명령어

```bash
# 포트 사용 확인
netstat -ano | findstr :5175
netstat -ano | findstr :8000

# Django 서버 실행
python manage.py runserver 8000

# Node 서버 실행
npm run dev

# 로그 확인
tail -f django.log
```

---

## 14. 배포 체크리스트

### 14.1 사전 점검
- [ ] 모든 테스트 통과
- [ ] 환경변수 설정 완료
- [ ] 보안 설정 확인
- [ ] 로그 설정 확인
- [ ] 백업 완료

### 14.2 배포 후 점검
- [ ] 서비스 정상 작동 확인
- [ ] API 응답 확인
- [ ] 로그 확인
- [ ] 성능 모니터링
- [ ] 오류 모니터링

---

## 15. 참고 자료

- [Django 공식 문서](https://docs.djangoproject.com/)
- [Node.js 공식 문서](https://nodejs.org/docs/)
- [React 공식 문서](https://react.dev/)
- [Vite 공식 문서](https://vitejs.dev/)
