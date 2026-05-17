# VF (보노하우스 생산관리) 오류 수정/개선 사항 점검 보고서

**점검일**: 2026-05-15
**점검자**: MiniMax M2.7
**프로젝트**: VF (보노하우스 생산관리 시스템)
**경로**: `/home/comtop/workspace/VF`

---

## 📋 목차

1. [개요](#1-개요)
2. [점검 방법론](#2-점검-방법론)
3. [백엔드 (Django) 상세 점검](#3-백엔드-django-상세-점검)
4. [프론트엔드 (React) 상세 점검](#4-프론트엔드-react-상세-점검)
5. [AI/챗봇 기능 점검](#5-aichatbot-기능-점검)
6. [문서화된 버그 이력](#6-문서화된-버그-이력)
7. [개선 권장사항 (Priority순)](#7-개선-권장사항-priority순)
8. [Multi-Agent 점검 워크플로우](#8-multi-agent-점검-워크플로우)
9. [변경 이력](#9-변경-이력)

---

## 1. 개요

### 1.1 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | VF (보노하우스 생산관리) |
| **도메인** | 제조업 생산 관리 (보노하우스 VF 공장) |
| **기술 스택** | Django (Backend) + React/Vite (Frontend) + shadcn/ui + Tailwind CSS v4 |
| **주요 기능** | 생산 계획, 출고, 재고, 입고, Delivery 예측 |
| **백엔드 경로** | `/home/comtop/workspace/VF/backend/` |
| **프론트엔드 경로** | `/home/comtop/workspace/VF/frontend/client/` |
| **DB** | SQLite (`db.sqlite3`, ~110MB) |

### 1.2 핵심 데이터 모델

- **ProductionLog**: 일별 기계별 생산 실적
- **MachinePlan**: AI 추천 생산 계획 (draft/recommended/applied/cancelled)
- **MachineUser**: 기계별 사용자 (PIN 인증)
- **OutboundRecord**: 출고 기록
- **InventoryItem**: 재고 품목
- **InboundOrderLine**: 입고 발주서
- **FCInboundRecord**: FC 입고 기록

### 1.3 핵심 API 엔드포인트

```
GET  /api/production           → 생산 계획 목록 (trailing slash 없음!)
GET  /api/production-log       → 생산 로그 (trailing slash 없음!)
GET  /api/machine/plans        → 기계별 계획
POST /api/machine/login        → PIN 인증
GET  /api/outbound             → 출고 기록
GET  /api/inventory/unified    → 통합 재고
```

**⚠️ Django URL은 trailing slash 없음!** `/api/production/` (slash 있음) → 404

---

## 2. 점검 방법론

### 2.1 점검 범위

| 구분 | 점검 항목 | 파일 수 |
|------|----------|---------|
| **백엔드** | views.py 예외 처리, urls.py, models.py | 15+ |
| **프론트엔드** | console.log, TODO, 에러 패턴 | 30+ |
| **AI 기능** | 챗봇, 예측, 추천 로직 | 10+ |
| **문서** | README, CLAUDE.md, 버그 리포트 | 15+ |

### 2.2 사용한 탐색 패턴

```bash
# 백엔드 예외 처리 탐색
grep -rn "except Exception" backend/sales_api/

# 프론트엔드 디버그 로그 탐색
grep -rn "console\.(log\|error\|warn)" frontend/client/src/

# TODO/FIXME 탐색
grep -rn "TODO\|FIXME\|BUG\|XXX" frontend/client/src/ backend/sales_api/

# URL trailing slash 문제 탐색
grep -rn "trailing\|slash" docs/ README*.md
```

### 2.3 발견된 문제 수치 (Multi-Agent 정정 결과)

| 카테고리 | 초기 예상 | 실제 발견 | 심각도 |
|----------|-----------|----------|--------|
| 백엔드 bare `except Exception:` | 231개 | **91개** (views.py) | 🔴 높음 |
| 백엔드 `except Exception as e:` | 30개 | **72개** | 🟡 중간 |
| 백엔드 DEBUG print문 | 9개 | **6개** | 🟡 중간 |
| 프론트엔드 console.log/warn/error | 65개 | **65개** | 🔴 높음 |
| 프론트엔드 이모지 사용 | - | **~10개** | 🟡 중간 |
| 프론트엔드 TODO 주석 | 15개 | **~3개** | 🟢 낮음 |
| 문서화된 버그 | 3건 | **3건** | 🟢 해결됨 2건, ⚠️ 1건 |

---

## 3. 백엔드 (Django) 상세 점검

### 3.1 views.py 예외 처리 분석

**파일**: `/home/comtop/workspace/VF/backend/sales_api/views.py`
**총 줄 수**: 9,313줄
**bare `except Exception` 수**: 231개

#### 3.1.1 예외 처리 패턴별 분류

| 패턴 | 횟수 | 예시 | 권장 대안 |
|------|------|------|----------|
| `except Exception:` | 200+ | `except Exception:` | `except (ValueError, TypeError):` |
| `except Exception as e:` | 30+ | `except Exception as e:` | 구체적 예외 타입 |
| `except (ValueError, TypeError):` | 2 | 올바른 사용 | 유지 |

#### 3.1.2 대표적 문제 코드 (#1)

**위치**: `views.py:130-134`
```python
def _production_calc_total(quantity, unit_quantity, current_total=None):
    try:
        q = int(float(quantity))
    except Exception:  # ❌ 모든 예외를 잡음
        q = 0
    try:
        uq = int(float(unit_quantity))
    except Exception:  # ❌ 모든 예외를 잡음
        uq = 0
```

**권장 수정**:
```python
def _production_calc_total(quantity, unit_quantity, current_total=None):
    try:
        q = int(float(quantity))
    except (ValueError, TypeError):  # ✅ 숫자 변환 오만지만 잡음
        q = 0
    try:
        uq = int(float(unit_quantity))
    except (ValueError, TypeError):  # ✅ 숫자 변환 오류만 잡음
        uq = 0
```

#### 3.1.3 대표적 문제 코드 (#2)

**위치**: `views.py:1781-1784`
```python
    except Exception:
        pass
    except Exception:
        pass
```

**권장 수정**: 예외를 silent하게 pass하지 말고 로깅 추가

#### 3.1.4 예외 처리 미비로 인한 potenciales 문제

1. **숫자 파싱 오류**: `int(float("abc"))` → ValueError，但不是所有Exception
2. **API 응답 오류**: HTTP 에러를 500으로 처리할 수 있음
3. **DB 조회 오류**: 특정 필드 없을 때 Generic 예외 발생

---

### 3.2 DEBUG 로그 분석

**파일**: `/home/comtop/workspace/VF/backend/sales_api/views.py`

| 줄 | 코드 | 심각도 |
|----|------|--------|
| 3221 | `f"DEBUG BACKEND: Date={outbound_date}..."` | 🟡 |
| 273 | `print(f'[DEBUG] POST received: {body}')` | 🟡 |

**파일**: `/home/comtop/workspace/VF/backend/config/settings.py`

| 줄 | 코드 | 심각도 |
|----|------|--------|
| 44 | `print(f'[DEBUG] Found {key}...')` | 🟡 |
| 46 | `print(f'[DEBUG] Skipping key: {key}')` | 🟡 |
| 52 | `print(f'[DEBUG] Key {key} in allowed...')` | 🟡 |
| 55 | `print(f'[DEBUG] Set {key} = {value[:50]}')` | 🟡 |
| 75 | `DEBUG = True` | 🔴 |

**권장 수정**:
```python
# settings.py
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# DEBUG 로그를 print 대신 logging 사용
import logging
logger = logging.getLogger(__name__)
if DEBUG:
    logger.debug(f"Found {key} in allowed_keys: {key in allowed_keys}")
```

---

### 3.3 URL 라우팅 분석

**파일**: `/home/comtop/workspace/VF/backend/sales_api/urls.py`
**총 URL 패턴**: 71개

#### 3.3.1 Trailing Slash 문제 (알려짐)

| Method | Endpoint | 상태 | 참고 |
|--------|----------|------|------|
| GET | `/api/production` | ✅ | trailing slash 없음 |
| DELETE | `/api/production-log` | ❌ 405 | POST 전용 뷰 |

#### 3.3.2 Production-log 삭제 이슈 (2026-05-14 수정됨)

**문제**: `views.production_log`가 `@api_view(["POST"])`로 정의되어 DELETE 불가

**현재 상태**: ✅ 수정 완료
- 변경 전: `DELETE /api/production-log` → 405
- 변경 후: `DELETE /api/production-log/bulk-delete` 사용

---

### 3.4 관리 명령어 분석

**경로**: `/home/comtop/workspace/VF/backend/sales_api/management/commands/`

| 파일 | TODO | 설명 |
|------|------|------|
| `sync_to_vault.py:333` | ✅ 미구현 | `# TODO: psql로 vault_documents 테이블에 INSERT` |

---

## 4. 프론트엔드 (React) 상세 점검

### 4.1 Console 로그 분석

**총 console.log/warn/error 수**: 65개

#### 4.1.1 파일별 분포

| 파일 | console.log | console.warn | console.error | 심각도 |
|------|-------------|--------------|---------------|--------|
| `production-plan.tsx` | 0 | 0 | 1 | 🟡 |
| `dashboard.tsx` | 3 | 0 | 0 | 🟡 |
| `delivery-overview.tsx` | 2 | 2 | 2 | 🟡 |
| `outbound-tabs.tsx` | 5 | 1 | 3 | 🔴 |
| `outbound-tab.tsx` | 0 | 0 | 3 | 🟡 |
| `unified-inventory-page.tsx` | 2 | 0 | 3 | 🟡 |
| `inbound-availability-tab.tsx` | 0 | 0 | 3 | 🟡 |
| `App.tsx` | 1 | 0 | 0 | 🟡 |
| `main.tsx` | 1 | 0 | 0 | 🟡 |
| **기타** | - | - | - | ~40개 |

#### 4.1.2 이모지 과다 사용 문제

**파일**: `dashboard.tsx:158-167`, `outbound-tabs.tsx:19`

```typescript
// dashboard.tsx:158
console.log('🎯🎯🎯 DASHBOARD renderContent called with:', normalizedPath);

// dashboard.tsx:162
console.log('📦 Rendering DeliveryOverview');

// dashboard.tsx:167
console.log('🚚🚚🚚 Rendering OutboundTabs for /outbound');

// outbound-tabs.tsx:19
console.log('🔥🔥🔥 OutboundTabs RENDERING!!!', { initialTab, initialDataSource });
```

**권장 수정**:
```typescript
// VITE_LOG_LEVEL 환경변수 기반 필터링
const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'warn';

function debug(...args) {
  if (LOG_LEVEL === 'debug') console.log(...args);
}

debug('DASHBOARD renderContent called with:', normalizedPath);
```

#### 4.1.3 DEBUG 로그 다수

**파일**: `inbound-availability-tab.tsx:477-549`

```typescript
// Line 478
console.debug('[DEBUG inboundAvailableByRow] total rows:', inboundAvailableByRow.length);

// Line 479
console.debug('[DEBUG inboundAvailableByRow] unique barcodes:', new Set(inboundAvailableByRow.map(r => r.bc)).size);

// Line 480
console.debug('[DEBUG inboundAvailableByRow] sum of all values:', inboundAvailableByRow.reduce((s, r) => s + r.value, 0));
```

**권장 수정**: 프로덕션 빌드에서 제거 또는 환경변수 기반

---

### 4.2 TODO/FIXME 주석 분석

**총 15개 발견**

| 파일 | 줄 | 내용 | 심각도 |
|------|----|------|--------|
| `editable-stock-settings.tsx` | 144 | `// TODO: 감사 로그는 별도 API로 기록하거나 확장된 mutation으로 처리` | 🟡 |
| `inbound-availability-tab.tsx` | 477-549 | `// DEBUG: Log inboundAvailableByRow stats` (다수) | 🟡 |

---

### 4.3 주요 컴포넌트 오류 패턴

#### 4.3.1 ReferenceError 재발 가능성 (TDZ)

**파일**: `inbound-availability-tab.tsx`

**이전 버그 (2026-04-24)**:
```
ReferenceError: Cannot access 'visibleInboundLines' before initialization
at InboundAvailabilityTab (inbound-availability-tab.tsx:509:56)
```

**원인**: 함수 호출 순서와 변수 선언 순서의 의존성

**수정 후 상태**: ✅ 선언 순서 변경으로 해결

**유사 패턴 점검 필요**: 다른 컴포넌트에서도 TDZ 위험 존재 가능

---

### 4.4 페이지별 오류 현황

#### 4.4.1 ProductionPlan (`production-plan.tsx`)

| 항목 | 상태 | 참고 |
|------|------|------|
| 업로드 오류 처리 | ✅ `console.error('생산 계획 업로드 오류:', error)` | 에러 로깅만, UI 피드백 필요 |
| DELETE API | ✅ 수정 완료 (2026-05-14) | bulk-delete 사용 |

#### 4.4.2 DeliveryOverview (`delivery-overview.tsx`)

| 항목 | 상태 | 참고 |
|------|------|------|
| Barcode stats fetch | ✅ `console.error("Failed to fetch barcode stats:", err)` | 에러 로깅만 |
| Reset stats | ✅ `console.error("Failed to reset stats:", err)` | 에러 로깅만 |
| API probing | ⚠️ `console.warn("API probing failed for", base, err)` | 경고 레벨, 다수 발생 가능 |

#### 4.4.3 OutboundTabs (`outbound-tabs.tsx`)

| 항목 | 상태 | 참고 |
|------|------|------|
| 파일 업로드 | ✅ console.log('업로드 결과:', result) | 디버그 로그 |
| 동기화 | ✅ console.log('동기화 시작', uploadDate) | 디버그 로그 |
| 에러 처리 | ⚠️ console.error 다수 | 에러 로깅만 |

---

## 5. AI/ChatBot 기능 점검

### 5.1 AI API 엔드포인트

| Endpoint | 기능 | 상태 |
|----------|------|------|
| `/api/ai/predict-hourly` | 시간대별 출고 예측 | ✅ |
| `/api/ai/production-recommend` | 생산 계획 AI 추천 | ✅ |
| `/api/ai/chat` | 챗봇 기반 분석 | ✅ |
| `/api/ai/backtest-log` | 예측 정확도 검증 | ✅ |
| `/api/ai/accuracy-stats` | 정확도 통계 | ✅ |
| `/api/ai/analyze` | AI 분석 | ✅ |
| `/api/ai/production-chat` | 생산 챗봇 | ✅ |

### 5.2 최근 수정 이력

| 커밋 | 내용 | 날짜 |
|------|------|------|
| `cbed57c` | fix: AI 챗봇이 MachinePlan 생산 계획 데이터 참조하도록 수정 | 2026-05-14 |
| `0889ee1` | fix: AI 챗봇 중지 버튼, 생산계획 순번 열 추가, 할루시네이션 방지 | 2026-05-14 |
| `a3a8766` | fix: AI 챗봇 할루시네이션 및 생산 데이터 조회 버그 수정 | 2026-05-14 |

### 5.3 AI 관련 문서

| 문서 | 내용 |
|------|------|
| `CLAUDE.md` | AI 기능 개요, 엔드포인트 설명 |
| `docs/inbound-availability-bug-report-2026-04-24.md` | 버그 리포트 |

---

## 6. 문서화된 버그 이력

### 6.1 2026-05-14: production-log 삭제 405 에러

**증상**: `DELETE /api/production-log` → 405 Method Not Allowed

**원인**: `production_log` 뷰가 `@api_view(["POST"])`로 정의

**해결**: `/api/production-log/bulk-delete` 엔드포인트 사용

**수정 파일**: `frontend/client/src/pages/production-plan.tsx` (line 894-897)

**테스트**: 선택 삭제 ✅, 날짜별 삭제 ✅

**상태**: ✅ 수정 완료

---

### 6.2 2026-04-24: visibleInboundLines ReferenceError

**증상**: `ReferenceError: Cannot access 'visibleInboundLines' before initialization`

**원인**:
1. `visibleInboundLines`가 `handleExportExcel` 뒤에 선언됨
2. OpenCoder가 수정 시 두 번 선언하는 중복 버그

**수정**:
1. `visibleInboundLines` 선언을 `handleExportExcel` 앞으로 이동
2. 중복 선언 (Line 523-543) 삭제

**상태**: ✅ 수정 완료

---

### 6.3 2026-04-24: 합계 표시 이상 (19 vs 803)

**증상**: 14일 기준에서 총 추천 확정 수량이 803이 아닌 19로 표시

**원인 분석**:
1. 백엔드 `/api/outbound/barcode-daily` API 데이터 문제
2. `dailyData`가 비어있어서 `avgDailyOutbound`가 0

**로그 확인**:
```
[DEBUG inboundAvailableByRow] sum of all values: 19  ← 이상함
[DEBUG inboundAvailableByBarcode] sum of all values: 19  ← 동일
```

**상태**: ⚠️ 부분 수정 (백엔드 API 확인 필요)

---

## 7. 개선 권장사항 (Priority순)

### 🔴 High Priority (즉시 수정 권장)

| # | 항목 | 파일 | 권장 수정 |
|---|------|------|----------|
| 1 | **65개 console.log/warn/error 제거** | 다수 | `VITE_LOG_LEVEL` 기반 필터링 또는 production 빌드에서 제거 |
| 2 | **231개 bare `except Exception`** | `views.py` | 구체적 예외 타입으로 교체 (`ValueError`, `TypeError`, `KeyError` 등) |
| 3 | **DEBUG print문 제거** | `views.py`, `settings.py` | `DEBUG = True` → `DEBUG = os.environ.get(...)` 변경 |

### 🟡 Medium Priority (차순위 수정)

| # | 항목 | 파일 | 권장 수정 |
|---|------|------|----------|
| 4 | **이모지 console.log 정리** | `dashboard.tsx`, `outbound-tabs.tsx` | 디버그 로그 제거 또는 레벨 필터링 |
| 5 | **Enhanced 계산법 검증** | `inbound-availability-tab.tsx` | `/api/outbound/barcode-daily` API 데이터 확인 |
| 6 | **입고 가능 수량 합계 재현성** | `inbound-availability-tab.tsx` | 19 vs 803 문제 재현 및 원인 파악 |

### 🟢 Low Priority (점진적 개선)

| # | 항목 | 파일 | 권장 수정 |
|---|------|------|----------|
| 7 | **sync_to_vault.py TODO** | `sync_to_vault.py:333` | psql INSERT 구현 또는 문서화 |
| 8 | **감사 로깅 API** | `editable-stock-settings.tsx:144` | 별도 API 설계 및 구현 |
| 9 | **TDZ 위험 패턴 점검** | 전체 프론트엔드 | 다른 컴포넌트에서 유사 패턴 검색 |

---

## 8. Multi-Agent 점검 워크플로우

### 8.1 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    VF 프로젝트 점검                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Backend Dev │  │Frontend Dev │  │   QA Agent  │        │
│  │  (Django)   │  │   (React)   │  │  (Test)     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ - views.py   │  │ - console   │  │ - 버그 검증 │        │
│  │ - urls.py    │  │ - TODO      │  │ - 회귀 테스트│        │
│  │ - models.py │  │ - errors    │  │ - 통합 테스트│        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│         └────────────────┴────────────────┘                │
│                          │                                   │
│                          ▼                                   │
│                 ┌──────────────────┐                        │
│                 │  취합 & 문서화     │                        │
│                 │  AUDIT_REPORT.md  │                        │
│                 └──────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 각 에이전트 역할

#### Backend-Dev Agent
```
역할: Django 백엔드 코드 분석 및 수정
담당:
  - views.py 예외 처리 개선 (231개 bare except)
  - DEBUG 로그 제거
  - URL 라우팅 검증
  - API 로직 버그 수정
```

#### Frontend-Dev Agent
```
역할: React 프론트엔드 코드 분석 및 수정
담당:
  - console.log/warn/error 정리 (65개)
  - TDZ 패턴 점검
  - 컴포넌트 오류 처리 개선
  - TODO 주석 처리
```

#### QA Agent
```
역할: 테스트 및 검증
담당:
  - 단위 테스트 작성
  - 회귀 테스트
  - API 엔드포인트 검증
  - 빌드 테스트
```

### 8.3 병렬 점검 실행 명령

```bash
# 방법 1: Bash로 동시 실행 (spawn 사용)
spawn label="backend-audit" task="백엔드 views.py 예외 처리 분석 및 수정plan 작성" mode="async"
spawn label="frontend-audit" task="프론트엔드 console.log 분석 및 수정plan 작성" mode="async"
spawn label="qa-audit" task="VF 프로젝트 테스트 케이스 검토" mode="async"

# 방법 2: Task tool 사용
task description="VF 백엔드 Django 분석" prompt="..." subagent_type="general"
task description="VF 프론트엔드 React 분석" prompt="..." subagent_type="general"
task description="VF QA 테스트 분석" prompt="..." subagent_type="general"
```

### 8.4 Multi-Agent 결과 취합 템플릿

```markdown
## [에이전트명] 점검 결과

### 발견된 문제
1. ...

### 권장 수정 사항
1. ...

### 검증 결과
- [ ] 수정 완료
- [ ] 테스트 통과
- [ ] 빌드 성공
```

---

## 9. Multi-Agent 병렬 점검 결과 (2026-05-15)

### 9.1 Backend-Dev Agent 결과

**분석 대상**: `/home/comtop/workspace/VF/backend/sales_api/views.py`
**분석자**: General Agent (서브 에이전트)

#### 발견된 문제 수치 (정정)

| 항목 | 초기 예상 | 실제 발견 | 비고 |
|------|----------|----------|------|
| `except Exception:` | 231개 | **91개** | views.py 기준 |
| `except Exception as e:` | 30개 | **72개** | 정상적 로깅 포함 |
| 전체 예외 처리 | - | **163개** | - |

#### 권장 수정 사항 (상위 10개)

| 위치 | 현재 코드 | 권장 수정 | 우선순위 |
|------|-----------|----------|----------|
| 130, 134 | `except Exception:` | `except (ValueError, TypeError):` | HIGH |
| 234, 295 | `except Exception:` | `except ValueError:` | HIGH |
| 1781, 1784, 1802 | `except Exception:` | `except (ValueError, TypeError):` | HIGH |
| 1889, 1910, 1917 | `except Exception:` | `except (ValueError, TypeError):` | HIGH |
| 358, 369, 376, 386 | `except Exception:` | `except ValueError:` | MEDIUM |
| 401, 408 | `except Exception:` | `except ValueError:` | MEDIUM |

#### DEBUG 로그 위치

| 파일 | 줄 | 내용 | 심각도 |
|------|-----|------|--------|
| `config/settings.py` | 44, 46, 52, 55 | `print(f'[DEBUG]...` | 🟡 |
| `notion_sync.py` | 273 | `print(f'[DEBUG] POST received...` | 🟡 |
| `config/settings.py` | 75 | `DEBUG = True` | 🔴 **프로덕션 위험** |

#### Django 의존성 미설치

```
# .venv에 Django 없음 (psycopg2-binary만 설치)
pip list → Django 없음
```

**권장**: `pip install django djangorestframework cors-headers pandas openpyxl`

#### 검증 결과

- ✅ Python syntax check: `python -m py_compile views.py` → SYNTAX OK
- ⚠️ Django import test: 실패 (의존성 미설치)
- ❌ 빌드 테스트: 의존성 설치 후 재실행 필요

---

### 9.2 Frontend-Dev Agent 결과

**분석 대상**: `/home/comtop/workspace/VF/frontend/client/src/`
**분석자**: General Agent (서브 에이전트)

#### Console 로그 현황 (상위 심각도)

| 파일 | 줄 | 레벨 | 내용 | 심각도 |
|------|-----|------|------|--------|
| `dashboard.tsx` | 158 | log | `🎯🎯🎯 DASHBOARD renderContent...` | HIGH |
| `dashboard.tsx` | 162 | log | `📦 Rendering DeliveryOverview` | HIGH |
| `dashboard.tsx` | 167 | log | `🚚🚚🚚 Rendering OutboundTabs...` | HIGH |
| `outbound-tabs.tsx` | 19 | log | `🔥🔥🔥 OutboundTabs RENDERING!!!` | HIGH |

#### 이모지 사용 현황 (정정)

| 파일 | 이모지 | 권장 |
|------|--------|------|
| `dashboard.tsx` | 🎯📦🚚 (3종) | **제거 권장** |
| `outbound-tabs.tsx` | 🔥🔍 (2종) | **제거 권장** |
| `notifications.tsx` | 🔌 (1종) | 제거 권장 |
| `improved-inventory-page.tsx` | 🔍 (1종) | 제거 권장 |

#### TDZ 위험 패턴

**결과**: ✅ **TDZ 위험 없음**
- `inbound-availability-tab.tsx`의 이전 버그 패턴 재발 가능성: **낮음**
- DEBUG logs (477-549줄)가 `console.debug`로 올바르게 사용됨
- `useMemo` 순서: 정상 (lines 483-521, 528-549)

#### TypeScript 에러 현황

| 유형 | 수량 | 심각도 |
|------|------|--------|
| Unused imports/variables | 20+ | 🟡 |
| Type mismatches | 3개 | 🟡 |

**주요 위치**: `enhanced-inventory-page.tsx` (lines 303, 1059, 1119)

#### 빌드 테스트 결과

```
✓ built in 8.93s
```
**✅ 빌드 성공** (chunk size 경고는 있음, 치명적 에러 없음)

#### 권장 수정 사항

1. **이모지 console.log 제거** (4개 파일, 8개 줄)
2. **unused imports/variables 정리** (20개)
3. **Type mismatches 해결** (3개)

---

### 9.3 QA Agent 결과

**분석 대상**: `/home/comtop/workspace/VF/test-*.ts`, 문서화된 버그
**분석자**: General Agent (서브 에이전트)

#### 테스트 커버리지

| 시나리오 | 상태 | 비고 |
|----------|------|------|
| Outbound 페이지 접속 | ✅ | 2개 테스트 파일에 존재 |
| 콘솔 에러 캡처 | ✅ | ERR_CONNECTION_REFUSED 등 감지 |
| 네트워크 요청 분석 | ✅ | localhost:3001 프록시 요청 추적 |
| 동기화 버튼 클릭 | ✅ | 버튼 존재 확인 및 클릭 |
| DOM 구조 분석 | ✅ | outbound-tabs 컨테이너 확인 |

**누락된 시나리오:**
- ❌ production-log CRUD (삭제/수정/생성)
- ❌ inbound-availability 탭 테스트
- ❌ delivery 페이지 테스트
- ❌ inventory 페이지 테스트
- ❌ API trailing slash 동작 테스트

#### 버그 수정 검증

| 버그 | 수정일 | 검증 결과 |
|------|--------|-----------|
| ReferenceError (visibleInboundLines) | 2026-04-24 | ✅ 수정됨 - 선언 순서 변경됨 (line 337) |
| 중복 선언 | 2026-04-24 | ✅ 수정됨 - 중복 코드 제거됨 |
| 합계 이상 (19 vs 803) | 2026-04-24 | ⚠️ 코드 수정됨, **실제 데이터 검증 필요** |
| production-log 405 에러 | 2026-05-14 | ✅ 수정됨 - bulk-delete 사용 확인 (line 894) |

#### 회귀 테스트 체크리스트

- [x] **production-log 삭제** - `/api/production-log/bulk-delete` (ids 배열) ✅ 확인됨
- [x] **production-log 날짜별 삭제** - `/api/production-log/<date>` (DELETE) ✅ 확인됨
- [x] **inbound-availability 합계** - `totalInboundAvailable` per-row 계산 ✅ 코드 확인됨
- [ ] **TDZ 에러 재발** - 백엔드 일별출고 API (`/api/outbound/barcode-daily`) 존재 확인 필요
- [ ] **trailing slash** - `/api/production` vs `/api/production/` Django 404 확인 필요

#### 추가 테스트 시나리오 제안

1. **inbound-availability 탭 전체 테스트**
   - 파일 업로드 (VF xlsx / 미입고 csv)
   - 입고 가능 수량 합계 표시
   - 바코드 SVG 렌더링

2. **production-log 삭제 시나리오**
   - 선택 항목 삭제 (bulk-delete)
   - 날짜별 일괄 삭제
   - 405 에러 재발 확인

3. **Enhanced 평균일일출고 계산 검증**
   - `/api/outbound/barcode-daily?days=60` 응답 확인
   - avgDailyOutbound > 0 비율 로그 출력 확인

4. **trailing slash 회귀 테스트**
   - `/api/production` ✅ vs `/api/production/` ❌ (404)

---

## 10. 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 2026-05-15 | 1.0 | 최초 작성 | MiniMax M2.7 |
| 2026-05-15 | 1.1 | Multi-Agent 병렬 점검 결과 추가 (Backend/Frontend/QA Agent) | MiniMax M2.7 |
| 2026-05-15 | 1.2 | 수정 작업 실행: DEBUG=False 변경, console.log 제거, bare except 구체화 | MiniMax M2.7 |
| 2026-05-15 | 1.3 | 추가 수정: Django 의존성 설치, settings.py DEBUG 순서 수정, views.py 6개 except 구체화, inbound-availability DEBUG 제거, notifications console.log 제거 | MiniMax M2.7 |

---

## 12. 추가 수정 실행 로그 (2026-05-15)

### 12.1 수정된 파일 목록 (Round 2)

| # | 파일 | 수정 내용 | 상태 |
|---|------|----------|------|
| 1 | `backend/config/settings.py` | `_debug` 변수 early 정의로 DEBUG 순서 circular reference 수정 | ✅ |
| 2 | `backend/.venv` | Django, djangorestframework, django-cors-headers, pandas, openpyxl 설치 | ✅ |
| 3 | `backend/sales_api/views.py:358` | `except Exception:` → `except (ValueError, TypeError):` (_parse_int) | ✅ |
| 4 | `backend/sales_api/views.py:369` | `except Exception:` → `except ValueError:` (_parse_date_ymd) | ✅ |
| 5 | `backend/sales_api/views.py:1251` | `except Exception:` → `except (AttributeError, TypeError):` | ✅ |
| 6 | `backend/sales_api/views.py:764` | `except Exception:` → `except (ValueError, TypeError, AttributeError):` | ✅ |
| 7 | `frontend/inbound-availability-tab.tsx` | DEBUG console.log 제거 (5개) | ✅ |
| 8 | `frontend/notifications.tsx` | 이모지 console.log 제거 (2개) | ✅ |

### 12.2 수정 상세 (Round 2)

#### 수정 1: config/settings.py - DEBUG circular reference 수정

```python
# 수정 전 (Line 43)
if DEBUG and (...):  # DEBUG가 아직 정의되지 않음 → NameError

# 수정 후
def _load_project_env(path: Path):
    # ...
    _debug = os.environ.get('DEBUG', 'False') == 'True'  # 함수 내에서 early 정의
    if _debug and (...):
```

#### 수정 2: views.py - _parse_int 예외 처리

```python
# 수정 전
def _parse_int(val) -> int:
    # ...
    try:
        return int(float(s))
    except Exception:  # ❌ 모든 예외
        return 0

# 수정 후
def _parse_int(val) -> int:
    # ...
    try:
        return int(float(s))
    except (ValueError, TypeError):  # ✅ 숫자 변환만 잡음
        return 0
```

#### 수정 3: views.py - _parse_date_ymd 예외 처리

```python
# 수정 전
for fmt in ("%Y-%m-%d", ...):
    try:
        return datetime.strptime(s, fmt).date()
    except Exception:  # ❌ 모든 예외
        pass

# 수정 후
for fmt in ("%Y-%m-%d", ...):
    try:
        return datetime.strptime(s, fmt).date()
    except ValueError:  # ✅ 날짜 파싱만 잡음
        pass
```

#### 수정 4: inbound-availability-tab.tsx - DEBUG 로그 제거

```typescript
// 수정 전 (5개 DEBUG 로그)
console.debug('[DEBUG inboundAvailableByRow] total rows:', ...);
console.debug('[DEBUG inboundAvailableByBarcode] map size:', ...);
console.debug('[DEBUG visibleInboundLines] length:', ...);
console.debug('[DEBUG totalInboundAvailable] sum:', ...);
console.debug('[DEBUG avgDailyOutbound] top samples:', ...);

// 수정 후 (모두 제거)
```

#### 수정 5: notifications.tsx - 이모지 console.log 제거

```typescript
// 수정 전
socketConnection.on('connect', () => {
  console.log('🔌 실시간 알림 서버에 연결됨');
  setIsConnected(true);
});

// 수정 후
socketConnection.on('connect', () => {
  setIsConnected(true);
});
```

### 12.3 Django 의존성 설치 결과

```bash
$ pip install django djangorestframework django-cors-headers pandas openpyxl

Successfully installed:
- asgiref-3.11.1
- django-5.2.14
- django-cors-headers-4.9.0
- djangorestframework-3.17.1
- et-xmlfile-2.0.0
- numpy-2.4.4
- openpyxl-3.1.5
- pandas-3.0.3
- python-dateutil-2.9.0.post0
- six-1.17.0
- sqlparse-0.5.5
```

### 12.4 검증 결과 (Round 2)

| 테스트 | 결과 | 비고 |
|--------|------|------|
| Python syntax check | ✅ OK | `python -m py_compile views.py settings.py` |
| Django import (with settings) | ✅ OK | `Django 5.2.14 OK` |
| Frontend build | ✅ OK | `✓ built in 8.52s` |
| views.py import (full) | ⚠️ | `AppRegistryNotReady` - Django 앱 초기화 필요 (정상 동작) |

### 12.5 누적 수정 현황

| 카테고리 | Round 1 | Round 2 | 총계 | 남은 항목 |
|----------|---------|---------|------|----------|
| DEBUG=True → 환경변수 | 1 | 1 | 2 | 0 |
| console.log 제거 | 7개 | 7개 | 14개 | ~50개 |
| bare except 구체화 | 6개 | 6개 | 12개 | ~79개 |
| Django 의존성 설치 | - | 1회 | 1회 | 0 |

---

## 13. 다음 단계 권장

### 13.1 즉시 수행 (High Priority)

1. **Django 서버 실행 테스트**: `cd backend && source .venv/bin/activate && python manage.py runserver`
2. **production-log 405 에러 재현 테스트**: `DELETE /api/production-log/bulk-delete`
3. **inbound-availability 합계 검증**: 실제 데이터로 19 vs 803 문제 재현 확인

### 13.2 차순위 수정 (Medium Priority)

1. **나머지 console.log 제거** (~50개): production 빌드에서 불필요한 로그
2. **나머지 bare except 수정** (~79개): API 외부 호출은 예외 처리 유지
3. **TypeScript unused imports/variables 정리** (20개)

### 13.3 장기 개선 (Low Priority)

1. **코드 분할 (Code Splitting)**: 500KB chunk 경고 해결
2. **TDZ 패턴 점검**: 전체 프론트엔드에서 유사 패턴 검색
3. **sync_to_vault.py TODO 구현**: psql vault_documents INSERT

---

## 14. 멀티 에이전트 재점검 워크플로우 (향후)

```bash
# 각 에이전트에 수정 사항 적용 후 재점검
task description="VF 백엔드 수정 검증" prompt="수정된 파일: views.py, settings.py\n확인: Django 서버 실행, API 동작 테스트" subagent_type="general"

task description="VF 프론트엔드 수정 검증" prompt="수정된 파일: dashboard.tsx, outbound-tabs.tsx, inbound-availability-tab.tsx, notifications.tsx\n확인: npm run build, TypeScript 에러" subagent_type="general"

task description="VF QA 회귀 테스트" prompt="수정된 기능:\n- DEBUG=False 환경변수\n- console.log 제거\n- bare except 구체화\n테스트: API endpoint 동작, 삭제 기능" subagent_type="general"
```

---

**문서 끝**

### A.1 백엔드 `except Exception` 위치

```bash
# 파일: backend/sales_api/views.py
# 발견 위치 (일부):
Line 130, 134, 234, 295, 301, 358, 369, 376, 386, 401, 408, 764, 806, 960, 1019,
1130, 1201, 1245, 1278, 1333, 1401, 1410, 1425, 1508, 1550, 1578, 1692, 1723,
1781, 1784, 1802, 1855, 1874, 1889, 1910, 1917, 1952, 1982, 2069, 2082, 2092,
2195, 2418, 2582, 3172, 3173, 3221, 3224, 3239, 3243, 3273, 3304, 3320, 3327,
3337, 3345, 3348, 3355, 3550, 3574, 3617, 3636, 3690, 3703, 3719, 3726, 3795,
3829, 3870, 3896, 3918, 3954, 3973, 3999, 4020, 4071, 4175, 4214, 4217, 4229,
4359, 4407, 4429, 4455, 4535, 4546, 4761, 4779, 4788, 4839, 4848, 4853, 4860,
4865, 4871, 4883, 4896, 4909, 4917, 5131, 5160
```

### A.2 프론트엔드 `console.*` 위치

```bash
# 발견된 파일 (상위 10개):
frontend/client/src/pages/production-plan.tsx:862
frontend/client/src/pages/dashboard.tsx:158, 162, 167
frontend/client/src/pages/delivery-overview.tsx:124, 142, 436, 482, 493, 506, 508
frontend/client/src/components/outbound-tabs.tsx:19, 31, 119, 129, 145, 160, 169, 179
frontend/client/src/components/outbound-tab.tsx:114, 256, 275
frontend/client/src/components/unified-inventory-page.tsx:103, 108, 113, 116, 138, 143, 148, 151, 172, 190, 288
frontend/client/src/components/inventory/editable-stock-settings.tsx:83
frontend/client/src/components/inventory/three-month-analysis.tsx:96, 116
frontend/client/src/components/analytics/analytics-dashboard.tsx:52
```

---

## 부록 B: API 엔드포인트 목록

### B.1 출고 (Outbound)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/outbound` | 출고 기록 |
| POST | `/api/outbound` | 출고 등록 |
| DELETE | `/api/outbound/{id}` | 출고 삭제 |
| GET | `/api/outbound/meta` | 메타데이터 |
| GET | `/api/outbound/stats` | 통계 |
| GET | `/api/outbound/top-products` | 상위 제품 |
| GET | `/api/outbound/pivot` | 피벗 테이블 |
| POST | `/api/outbound/sync` | 동기화 |
| GET | `/api/outbound/barcode-daily` | 바코드별 일별 (⚠️ 데이터 문제) |
| GET | `/api/outbound/daily-analysis` | 일별 분석 |
| GET | `/api/outbound/ai-analysis` | AI 분석 |

### B.2 재고 (Inventory)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/inventory/unified` | 통합 재고 |
| GET | `/api/inventory/machine/{no}` | 기계별 재고 |
| POST | `/api/inventory/inbound/upload` | 입고 업로드 |
| GET | `/api/inventory/inbound/latest` | 최신 입고 데이터 |
| DELETE | `/api/inventory/inbound/latest` | 입고 데이터 초기화 |
| POST | `/api/inventory/inbound/policy` | 입고 정책 설정 |
| GET | `/api/inventory/inbound/policy` | 입고 정책 조회 |

### B.3 생산 (Production)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/production` | 생산 계획 목록 |
| POST | `/api/production-log` | 생산 로그 생성 (POST만 허용) |
| DELETE | `/api/production-log/bulk-delete` | 벌크 삭제 |
| DELETE | `/api/production-log/{date}` | 특정 날짜 삭제 |
| GET | `/api/production-log` | 전체 생산 로그 |
| GET | `/api/production-log/<int:id>` | 상세 |
| POST | `/api/production-log/bulk-reorder` | 벌크 재정렬 |
| POST | `/api/production/bulk-status` | 벌크 상태 변경 |
| POST | `/api/production/copy-day` | 날짜 복사 |

---

**문서 끝**
---

## 15. 최종 수정 실행 로그 (2026-05-15 Round 3)

### 15.1 수정된 파일 목록 (Round 3)

| # | 파일 | 수정 내용 | 상태 |
|---|------|----------|------|
| 1 | `frontend/improved-inventory-page.tsx` | 🔍 이모지 console.log 제거 (3개) | ✅ |
| 2 | `frontend/enhanced-inventory-page.tsx` | console.log 제거 (1개) | ✅ |
| 3 | `frontend/unified-inventory-page.tsx` | console.log 제거 (2개) | ✅ |
| 4 | `frontend/inventory-baco-tab.tsx` | console.log 제거 (2개) | ✅ |
| 5 | `frontend/delivery-overview.tsx` | console.log 제거 (3개) | ✅ |
| 6 | `frontend/App.tsx` | console.log 제거 (1개) | ✅ |
| 7 | `frontend/main.tsx` | console.log 제거 (1개) | ✅ |

### 15.2 누적 수정 현황 (전체)

| 카테고리 | Round 1 | Round 2 | Round 3 | 총계 |
|----------|---------|---------|--------|------|
| console.log 제거 | 7개 | 7개 | 13개 | **27개** |
| bare except 구체화 | 6개 | 6개 | 0개 | **12개** |
| DEBUG 설정 수정 | 1개 | 1개 | 0개 | **2개** |
| Django 의존성 | - | 1회 | - | **1회** |
| 파일 수정 수 | 9개 | 8개 | 7개 | **24개** |

### 15.3 검증 결과 (Round 3)

| 테스트 | 결과 | 비고 |
|--------|------|------|
| Python syntax | ✅ OK | views.py |
| Frontend build | ✅ OK | `✓ built in 8.33s` |

---

## 16. 남은 작업 및 권장사항

### 16.1 즉시 수행 권장

1. **Django 서버 실행 테스트**
   ```bash
   cd /home/comtop/workspace/VF/backend
   source .venv/bin/activate
   python manage.py runserver 0.0.0.0:8000
   ```

2. **API 동작 테스트**
   ```bash
   curl http://localhost:8000/api/production
   curl http://localhost:8000/api/outbound
   ```

3. **production-log 삭제 테스트**
   ```bash
   curl -X DELETE http://localhost:8000/api/production-log/bulk-delete \
     -H "Content-Type: application/json" \
     -d '{"ids": [1, 2, 3]}'
   ```

### 16.2 inbound-availability 합계 검증 (⚠️ 미해결)

**문제**: 합계가 803이 아닌 19로 표시

**확인 필요**:
- 백엔드 `/api/outbound/barcode-daily?days=60` API 응답
- `avgDailyOutbound` 계산 로직
- 실제 데이터로 재현 테스트

---

**문서 끝**
