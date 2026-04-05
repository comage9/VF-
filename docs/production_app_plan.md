# 생산 계획 모바일 웹앱 개선 계획

## 1. 개요

**현재 상태**: 데스크톱 중심의 생산 계획 페이지 (CRUD, 파일 업로드, 상태 관리 가능)

**요구사항**:
- 스마트폰 웹앱 형식 (모바일 우선 UI)
- 생산 계획 생성/수정/삭제
- 기계별 사용자별 작업 관리 (시작/중지/완료)
- AI 기반 생산 계획 추천 (기존 데이터 활용)
- 기본 계획 날짜:明日 (오늘 4/5 → 계획 4/6)

---

## 2. 아키텍처 설계

### 2.1 시스템 구성

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Web App                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ 기계1 UI │  │ 기계2 UI │  │ 기계3 UI │  ...        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │             │             │                    │
│       └─────────────┴─────────────┘                    │
│                      │                                  │
│              ┌───────┴───────┐                          │
│              │  사용자 인증   │  (기계별 PIN/코드)       │
│              └───────┬───────┘                          │
└──────────────────────┼──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Django Backend                        │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ 기존 ProductionLog │  │ 신규: 사용자/기계 관리 │     │
│  └────────────────┘  └────────────────┘                 │
│                      │                                  │
│              ┌───────┴───────┐                          │
│              │ AI Plan API   │                          │
│              └───────┬───────┘                          │
│                      │                                  │
│              ┌───────┴───────┐                          │
│              │ 기존 데이터   │ (MasterSpec, Outbound)   │
│              └───────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 새로운 데이터 모델

```python
# MachineUser - 기계별 사용자 관리
class MachineUser(models.Model):
    machine_number = models.CharField(max_length=20, db_index=True)
    user_pin = models.CharField(max_length=10)  # 4-6자리 PIN
    user_name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

# MachinePlan - AI 추천 계획 임시 저장
class MachinePlan(models.Model):
    date = models.DateField(db_index=True)
    machine_number = models.CharField(max_length=20, db_index=True)
    product_name = models.CharField(max_length=255)
    color1 = models.CharField(max_length=100)
    color2 = models.CharField(max_length=100, blank=True)
    quantity = models.IntegerField(default=0)
    unit_quantity = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='recommended')
    ai_reason = models.TextField(blank=True)  # AI 추천 이유
    created_at = models.DateTimeField(auto_now_add=True)
```

---

## 3. 모바일 웹앱 UI 구성

### 3.1 로그인 화면 (기계 선택 + PIN)

```
┌────────────────────────────┐
│  🏭 생산 계획              │
│                            │
│  기계를 선택하세요          │
│                            │
│  ┌──────────────────────┐  │
│  │ 1번 기계 (M001)      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 2번 기계 (M002)      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 3번 기계 (M003)      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 4번 기계 (M004)      │  │
│  └──────────────────────┘  │
│                            │
│  PIN: [ ][ ][ ][ ]         │
│                            │
│  [로그인]                  │
└────────────────────────────┘
```

### 3.2 메인 대시보드 (개별 기계용)

```
┌────────────────────────────┐
│  M001 - 1번 기계    ↙Logout│
│  2026-04-06 (내일)         │
├────────────────────────────┤
│  📊 오늘的计划            │
│                            │
│  ┌────────────────────────┐│
│  │ ● 토이 아이보리        ││
│  │   금형: T001 | 색상: Ivory│
│  │   수량: 50박스 × 10개  ││
│  │   총계: 500개    [▶시작]││
│  └────────────────────────┘│
│                            │
│  ┌────────────────────────┐│
│  │ ○ 헬로키티 푸샤        ││
│  │   [AI 추천] [+] 추가   ││
│  └────────────────────────┘│
│                            │
│  ┌────────────────────────┐│
│  │ ○ 브라운 스토리        ││
│  │   [AI 추천] [+] 추가   ││
│  └────────────────────────┘│
│                            │
│  [+ 새 계획 추가]  [🤖 AI] │
└────────────────────────────┘
```

### 3.3 AI 챗 인터페이스

```
┌────────────────────────────┐
│  🤖 AI 생산 계획 도우미   │
├────────────────────────────┤
│                            │
│  사용자: 4번 기계에 토이    │
│          아이보리 추가해줘  │
│                            │
│  ┌────────────────────────┐│
│  │ 검색 중...             ││
│  │ "토이 아이보리" 관련     ││
│  │ 데이터를查找中...       ││
│  └────────────────────────┘│
│                            │
│  AI: 토이 아이보리 확인됨  │
│                            │
│  📊 Historical Data:       │
│  - 평균 생산량: 45박스/일  │
│  - 최근 5회: 50, 48, 52,   │
│            45, 47 (평균 48)││
│                            │
│  💡 권장:                  │
│  - 단위수량: 10개/박스     │
│  - 권장 생산수량: 50박스    │
│  - 총계: 500개             │
│                            │
│  [✓ 적용하기] [수정] [취소] │
└────────────────────────────┘
```

---

## 4. API Endpoints

### 4.1 인증 API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/machine/login` | 기계별 PIN 로그인 |
| POST | `/api/machine/logout` | 로그아웃 |

### 4.2 생산 계획 API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/machine/plans?date=YYYY-MM-DD` | 해당 날짜 계획 조회 |
| POST | `/api/machine/plans` | 새 계획 생성 |
| PUT | `/api/machine/plans/{id}` | 계획 수정 |
| DELETE | `/api/machine/plans/{id}` | 계획 삭제 |
| POST | `/api/machine/plans/{id}/start` | 작업 시작 |
| POST | `/api/machine/plans/{id}/stop` | 작업 중지 |
| POST | `/api/machine/plans/{id}/complete` | 작업 완료 |

### 4.3 AI API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/production-recommend` | AI 추천 생성 |

**AI 추천 요청 예시:**
```json
{
  "machine_number": "M004",
  "product_name": "토이 아이보리",
  "target_date": "2026-04-06"
}
```

**AI 추천 응답 예시:**
```json
{
  "success": true,
  "recommendation": {
    "product_name": "토이 아이보리",
    "color1": "Ivory",
    "unit_quantity": 10,
    "recommended_quantity": 50,
    "total": 500,
    "reason": "최근 5회 평균 48박스, 최대 52박스 생산実績参考",
    "history": [
      {"date": "2026-04-04", "quantity": 50},
      {"date": "2026-04-03", "quantity": 48},
      {"date": "2026-04-02", "quantity": 52}
    ]
  }
}
```

---

## 5. AI 데이터 연동

### 5.1 기존 데이터 구조

| 테이블 | 활용 데이터 |
|--------|------------|
| `MasterSpec` | 제품명, 금형번호, 색상1/2, 기본수량 |
| `ProductionLog` | 과거 생산 실적 (기계별, 제품별) |
| `OutboundRecord` | 출고 데이터 (판매량 참조) |
| `get_outbound_stats` | 일별/주별/월별 출고 통계 |

### 5.2 AI 추천 로직 (출고량 기반)

1. **입력**: 제품명, 기계번호, 목표 날짜
2. **검색**: 
   - MasterSpec에서 제품 스펙 조회
   - ProductionLog에서 해당 제품+기계의 역사적 데이터 조회
   - **OutboundRecord에서 해당 제품의 출고량 조회**
3. **분석**:
   - 최근 5-10회 생산량 평균 계산
   - **출고 데이터와 비교** (판매 추세 판단)
   - **재고 소진 속도 계산** → 적절 생산량 산정
4. **출력**: 권장 단위수량, 권장 생산수량, 근거

### 5.3 출고량 기반 생산량 계산 로직

```python
def calculate_production_recommendation(machine_number, product_name, target_date):
    # 1. 해당 제품의 최근 7일 출고량 조회
    outbound_qty = OutboundRecord.objects.filter(
        product_name=product_name,
        outbound_date__gte=target_date - timedelta(days=7)
    ).aggregate(total=Sum('box_quantity'))['total'] or 0

    # 2. 해당 기계의 해당 제품 생산 이력
    production_history = ProductionLog.objects.filter(
        machine_number=machine_number,
        product_name=product_name
    ).order_by('-date')[:10]

    avg_production = production_history.aggregate(avg=Avg('quantity'))['avg'] or 0

    # 3. 출고 추세 분석 (증가/유지/감소)
    recent_outbound = OutboundRecord.objects.filter(
        product_name=product_name
    ).order_by('-outbound_date')[:7].values_list('box_quantity', flat=True)

    if len(recent_outbound) >= 3:
        trend = (recent_outbound[0] - recent_outbound[2]) / recent_outbound[2]
        # trend > 0.1: 증가세, trend < -0.1: 감소세
    else:
        trend = 0

    # 4. 권장 생산량 계산
    # - 출고량이 증가하면 생산량 증가
    # - 출고량이 감소하면 생산량 감소
    recommended_qty = int(avg_production * (1 + trend * 0.5))

    return {
        "product_name": product_name,
        "recent_outbound_avg": outbound_qty / 7,  # 일평균 출고
        "avg_production": avg_production,
        "trend": trend,
        "recommended_quantity": recommended_qty,
        "reason": f"최근 7일 평균 출고 {outbound_qty/7:.0f}개, 추세 {'증가' if trend > 0.1 else '감소' if trend < -0.1 else '유지'}"
    }
```

### 5.4 AI 추천 응답 예시

```json
{
  "success": true,
  "recommendation": {
    "product_name": "토이 아이보리",
    "color1": "Ivory",
    "unit_quantity": 10,
    "recommended_quantity": 50,
    "total": 500,
    "reason": "최근 7일 평균 출고 45개/일, 증가 추세 (+8%), 권장 생산 50박스",
    "outbound_data": {
      "daily_avg": 45,
      "trend": "increasing",
      "trend_percent": 8
    },
    "production_history": {
      "avg_quantity": 48,
      "recent_5": [50, 48, 52, 45, 47]
    }
  }
}
```

---

## 6. 구현 우선순위

### Phase 1: 기본 모바일 UI (1주)
- [ ] 기계 선택 + PIN 인증 화면
- [ ] 개별 기계 대시보드
- [ ] 생산 계획 CRUD (모바일 최적화)
- [ ] 작업 시작/중지/완료 기능

### Phase 2: AI 추천 기능 (1주)
- [ ] MachineUser, MachinePlan 모델 추가
- [ ] AI 추천 API 구현
- [ ] 모바일 AI 챗 인터페이스
- [ ] 기존 데이터 연동 (MasterSpec, ProductionLog, **OutboundRecord**)
- [ ] **Draft 상태 관리** (AI 추천 → 사용자가 적용 버튼 클릭 → ProductionLog 저장)

### Phase 3: PWA 적용 (1주)
- [ ] PWA 매니페스트 설정
- [ ] Service Worker (오프라인 지원)
- [ ] 홈 화면 설치 최적화
- [ ] Push 알림 (작업 시작/완료)

### Phase 4: 고도화 (필요시)
- [ ] 실시간 상태 동기화 (WebSocket)
- [ ] 다중 사용자 세션 관리
- [ ] 작업 로그 이력

---

## 7. 기술 스택

- **Frontend**: React + Tailwind (모바일 우선)
- **Backend**: Django (기존 활용)
- **Mobile**: PWA (Progressive Web App)
- **Auth**: PIN 기반 간단 인증 (4~6자리)

---

## 8. PIN 인증 시스템

### 8.1 MachineUser 모델 상세

```python
class MachineUser(models.Model):
    machine_number = models.CharField(max_length=20, db_index=True)
    user_pin = models.CharField(max_length=6)  # SHA-256 해시 저장
    user_name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    failed_attempts = models.IntegerField(default=0)  # 실패 횟수
    locked_until = models.DateTimeField(null=True, blank=True)  # 잠금 시간
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['machine_number', 'user_name']]
```

### 8.2 인증 로직

```
1. 사용자 → 기기 선택 → PIN 입력
2. 서버 → PIN 해시 검증 → 세션 토큰 반환
3. 세션 토큰으로 해당 기기的计划만 접근 가능
4. 5회 연속 실패 → 5분 잠금
```

### 8.3 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/machine/login` | `{ machine_number, user_pin }` → `{ token, user_name }` |
| POST | `/api/machine/logout` | 로그아웃 (토큰 무효화) |
| GET | `/api/machine/verify` | 토큰 유효성 검증 |
| POST | `/api/machine/users` | 사용자 추가 (관리자용) |

---

## 9. Draft 상태 관리 (AI 추천)

### 9.1 MachinePlan 모델 상세

```python
class MachinePlan(models.Model):
    STATUS_CHOICES = [
        ('draft', '임시저장'),      # AI 추천 후 사용자가 수정 중
        ('recommended', '추천'),     # AI가 추천한 상태
        ('applied', '적용됨'),      # 사용자가 적용 버튼 클릭
        ('cancelled', '취소됨'),     # 사용자가 취소
    ]

    date = models.DateField(db_index=True)
    machine_number = models.CharField(max_length=20, db_index=True)
    user = models.ForeignKey(MachineUser, on_delete=models.CASCADE, null=True)
    product_name = models.CharField(max_length=255)
    product_name_eng = models.TextField(blank=True, default='')
    mold_number = models.CharField(max_length=255, blank=True, default='')
    color1 = models.CharField(max_length=100)
    color2 = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20, default='BOX')
    quantity = models.IntegerField(default=0)
    unit_quantity = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='recommended', choices=STATUS_CHOICES)
    ai_reason = models.TextField(blank=True)  # AI 추천 근거
    outbound_data = models.JSONField(null=True, blank=True)  # 출고 데이터 (분석 결과)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### 9.2 상태 흐름

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI 추천    │────▶│  사용자 확인 │────▶│ 적용 클릭   │
│ (recommended)│     │ (draft)     │     │ (applied)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ ProductionLog │
                                        │ (실제 생산 계획) │
                                        └─────────────┘
```

### 9.3 동작流程

| Action | Result |
|--------|--------|
| AI推荐 → | MachinePlan (status: 'recommended') 생성 |
| 사용자가 수정 → | MachinePlan (status: 'draft') 업데이트 |
| 사용자가 적용 → | MachinePlan (status: 'applied') + ProductionLog 생성 |
| 사용자가 취소 → | MachinePlan (status: 'cancelled') |

---

## 10. PWA (Progressive Web App) 구현

### 10.1 매니페스트 (manifest.json)

```json
{
  "name": "VF 생산 계획",
  "short_name": "VF 생산",
  "description": "VF 모바일 생산 계획 앱",
  "start_url": "/production-app",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 10.2 Service Worker 기능

| 기능 | 설명 |
|------|------|
| Cache First | 정적 자산 (JS, CSS, 이미지) 캐시 |
| Network First | API 데이터는 네트워크 우선, 실패 시 캐시 |
| Background Sync | 오프라인 시 작업 대기, 온라인 시 자동 동기화 |
| Push Notification | 작업 시작/완료 알림 (선택적) |

### 10.3 오프라인 지원 화면

```
┌────────────────────────────┐
│  ⚠️ 오프라인 상태           │
│                            │
│  현재 데이터를 표시합니다.  │
│  (마지막 동기화: 10:30)     │
│                            │
│  [🔄 새로고침]             │
└────────────────────────────┘
```

### 10.4 PWA 설치 확인

```javascript
// 설치 가능 여부 확인
if ('serviceWorker' in navigator && 'standalone' in window) {
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
  if (!isInstalled) {
    // 설치 배너 표시
  }
}
```

---

## 11. API 전체 목록

### 11.1 인증 API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/machine/login` | 기계별 PIN 로그인 |
| POST | `/api/machine/logout` | 로그아웃 |
| GET | `/api/machine/verify` | 토큰 검증 |
| POST | `/api/machine/users` | 사용자 추가 (관리자) |
| GET | `/api/machine/users?machine={num}` | 특정 기계 사용자 조회 |

### 11.2 생산 계획 API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/machine/plans?date=YYYY-MM-DD` | 해당 날짜 계획 조회 |
| POST | `/api/machine/plans` | 새 계획 생성 |
| PUT | `/api/machine/plans/{id}` | 계획 수정 |
| DELETE | `/api/machine/plans/{id}` | 계획 삭제 |
| POST | `/api/machine/plans/{id}/start` | 작업 시작 |
| POST | `/api/machine/plans/{id}/stop` | 작업 중지 |
| POST | `/api/machine/plans/{id}/complete` | 작업 완료 |
| POST | `/api/machine/plans/{id}/apply` | AI 추천 적용 → ProductionLog 저장 |

### 11.3 AI API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/production-recommend` | AI 추천 생성 (출고량 분석 포함) |
| GET | `/api/ai/history/{product_name}` | 제품별 출고/생산 이력 |

---

## 12. 참고: 날짜 로직

요구사항: "오늘이 4-5일이면 계획은 4-6일로 업로드"

```javascript
// 기본: 내일의 날짜
const getDefaultPlanDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);  // "2026-04-06"
};

// 사용자가 날짜 선택 가능
// 기본값은 항상 내일
```