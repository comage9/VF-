# Delivery 시간별·일별 출고 예측 수정 계획

**작성일:** 2026-07-18  
**대상:** `/delivery` 페이지 (시간별 출고 예측 로직 + 내일 예측 테이블)

---

## 1. 증상 정리

| # | 증상 | 관측 |
|---|------|------|
| A | 시간별 예측이 실제와 격차 큼 | 차트 잔여 시간·마감(23시) 예측이 현실 누적과 괴리 |
| B | 내일 예측의 일·월(요일/월초·중·말) 값이 비현실 | 90일 평균·계수 곱이 실제 요일 중앙값과 동떨어짐 |
| C | 7/19가 “(오늘)”로 표기 | 오늘(7/18)이 아닌 예측 시작일(내일)에 “오늘” 라벨 |

---

## 2. 근본 원인

### 2.1 날짜 라벨 (C) — 명확한 버그

- **API** `GET /api/delivery/daily-prediction` 기본 `start_date` = **내일** (`timezone.localdate() + 1`).
- **프론트** `dashboard.js`:
  ```js
  dayLabel = pred.date === meta.start_date ? '(오늘)' : ...
  ```
  → 첫 예측일(내일)을 무조건 “오늘”로 표시.
- `getTomorrowDate()` 가 `toISOString()` 사용 → **UTC 날짜**로 깨질 수 있음 (KST 자정 전후).

### 2.2 일별 예측 비현실 (B)

- 공식: `predicted = 90일 산술평균 × 요일계수 × 월초말계수 × 휴일계수`
- 실제 데이터: 평일 중앙값 ~600대인데, 일부일 총량이 **5,000~7,000** 이상치 →  
  - 90일 평균 ~1,067, 최근 28일 평균 ~2,059 로 **이상치에 끌림**
  - 요일별 중앙값(Mon med 678 등)과 동떨어진 예측 생성
- 요일·월 계수도 **평균 기반**이라 이상치에 왜곡.

### 2.3 시간별 마감 예측 격차 (A)

- `POST /api/ai/predict-hourly`:  
  - 동일 시각 대비 **잔여 증가분 중앙값 × 0.85**  
  - 최근 21일 가중치를 **같은 값을 두 번 append** (이중 가중) → 분포 왜곡  
  - **완료 비율(현재 누적 / 당일 최종)** 미사용 → 이미 높은 누적일 때 과다 증가 가능
- 클라이언트 `calculateRealisticPrediction`:
  - 유사 사례 허용 오차 **±0.05%** (너무 좁음) → 사례 부족·부실 폴백
- 클라이언트 AI 후처리: `min(AI, 최근7일평균)` — 7일 평균이 이상치에 끌리면 **과대/과소 상한** 잘못 적용.

---

## 3. 수정 방향 (목표 공식)

### 3.1 날짜 유틸 (공통)

- 로컬(KST 브라우저) `YYYY-MM-DD` 헬퍼: `formatLocalYmd(d)`
- 라벨:
  - `pred.date === today` → `(오늘)`
  - `pred.date === tomorrow` → `(내일)`
  - `pred.date === dayAfter` → `(모레)` (선택)
- API 응답에 `meta.today`, `meta.server_today` 포함해 서버·클라 교차 검증 가능하게.

### 3.2 일별 예측 (Stage 1) — 중앙값 블렌드

```
same_dow_med   = 최근 8~12주 동일 요일 total 중앙값 (이상치 제거 후)
recent_med     = 최근 28일 total 중앙값
base_trim      = 90일 IQR/절사 후 중앙값 또는 trimmed mean

predicted_total =
  0.55 * same_dow_med
+ 0.25 * recent_med
+ 0.20 * base_trim

# 월초/월중/월말: 동일 요일 대비 약보정만 (±15% 이내)
# 휴일 계수는 유지 (0.5 / 0.75 / 0.85)
# 최종 클립: same_dow_med * [0.55, 1.45] 범위
```

- 요일·월 **factor 표시값**도 중앙값 비율로 재계산해 UI “일·월화” 의미를 현실화.
- 시간 분포(Stage 2): 동일 요일 누적 비율 유지, 합=predicted_total 정규화.

### 3.3 시간별 마감 예측 (`ai_predict_hourly`)

우선순위:

1. **완료비율법**  
   - 동일 요일 과거: `ratio_h = hour_h / day_total` 중앙값  
   - `predicted_eod = current_total / ratio_h` (ratio_h > 0.05일 때)
2. **잔여 증가분 중앙값** (폴백) — 이중 append 제거, 최근 가중은 1.5배 점수 가중만
3. 보수 계수 0.85 제거 또는 **0.95**로 완화 (완료비율 경로에서는 미적용)
4. 상·하한:  
   - `current_total ≤ pred ≤ max(current*1.02, same_dow_med * 1.35)`  
   - 하한: 현재 누적 이상

### 3.4 클라이언트 예측

- 유사 사례 허용: **±8%** (최소 ±15 박스)
- 동일 요일 우선 샘플링
- 7일 기준선: **평균 → 중앙값**
- AI 후처리: `min(AI, 7일평균)` 제거 →  
  `clip(AI, p25~p90 of recent same-dow finals)` 또는 중앙값×[0.7, 1.3]

---

## 4. 파일 변경 목록

| 파일 | 변경 |
|------|------|
| `frontend/client/public/js/dashboard.js` | 날짜 라벨, 로컬 ymd, 유사도, 7일 중앙값, AI 클립 |
| `backend/sales_api/views.py` | `delivery_daily_prediction`, `ai_predict_hourly` |
| `docs/DELIVERY_PREDICTION_FIX_PLAN.md` | 본 계획 |

---

## 5. 검증

1. 오늘=2026-07-18 기준 API `num_days=3` → 날짜 7/19,7/20,7/21, 라벨 내일/모레/…
2. 예측 총량이 동일 요일 중앙값 대비 ±45% 이내
3. 현재 누적 500, 동일 요일 12시 비율 0.7이면 마감 예측 ≈ 714 근처
4. 백엔드 단위: 이상치(6000+) 포함 샘플에서도 중앙값 경로 유지

---

## 6. 배포·백업

1. 코드 수정 후 로컬 검증
2. `git add` (예측 관련 + 계획 문서 중심; 대용량 PDF는 기존 정책 따름)
3. `git commit` / `git push origin main`
4. `G:\` 에 프로젝트 전체(데이터 포함) 백업 복사

---

## 7. 의도적으로 하지 않는 것

- Prophet/LLM 기반 예측 교체 (속도·복잡도)
- 이상치 날짜 삭제 (데이터 정화는 별 작업)
- 출고 실데이터 스키마 변경
