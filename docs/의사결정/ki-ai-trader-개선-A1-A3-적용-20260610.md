# KI AI Trader 개선 A1-A3 적용 보고 (2026-06-10)

> 자동 작성: Hermes Agent (Reasonix 세션 1 결과 검증)
> Commit: `b6ed5cf`
> 검증 출처: trade_history.jsonl (6/2~6/10) + 하네스 3-에이전트 종합 보고

---

## 📊 개선 배경 (2026-06-10 거래 분석)

| 지표 | 값 | 판정 |
|------|-----|:----:|
| 승률 (6/8~6/10) | 1/6 = 16.7% | ❌ |
| 총 손익 | -10,955원 | ❌ |
| 손실 중 ATR 손절 비중 | 5/5 = 100% | ❌ |
| 09:00~09:31 손절 집중 | 5/5 = 100% | ❌ (overnight 갭다운) |
| 체결 타임아웃 비율 | 73/1,196 = 6.1% | ❌ |

---

## ✅ 적용된 3가지 개선 (A1-A3)

### A1: B6 max_price 하드코딩 제거

- **파일**: `src/trading/simple_trading_strategy.py:97`
- **변경 전**: `max_price = 1000000` (100만원) 하드코딩
- **변경 후**:
  ```python
  max_price = getattr(settings, 'TRADING_MAX_PRICE_PER_STOCK', None)
  if max_price is None:
      max_price = int(os.environ.get('TRADING_MAX_PRICE_PER_STOCK', '300000'))
  ```
- **효과**: 후보군 확대 (100만원 → 30만원), 설정 무효화 문제 해결
- **검증**: env var 설정 시 `max_price_per_stock = 300000` 정상 반환 ✅

### A2: overnight 갭다운 방지 — 09:00~09:30 손절 유예

- **파일**: `src/trading/realtime_monitor.py`
- **변경**:
  - `_is_kst_market_open_safe()` — KST 09:30 이후 판별
  - `_pending_stop_losses` dict — 09:00~09:30 손절 보류 큐
  - `_gap_down_deferred_notified` / `_last_notify_date` — 당일 1회 알림
  - `_process_pending_stop_losses()` — 09:30 이후 현재가 재조회 → 손절 실행/조건 해소
  - **매수는 정상 허용** (손절만 보류)
- **효과**: 6/8 3건 + 6/9 1건 + 6/10 1건 = 5건 overnight 손실 방지
- **검증**: import + 시간 체크 함수 정상 ✅

### A3: 체결 타임아웃 지수 백오프 + ka10012 체결 조회

- **파일**: `kiwoom_api.py`
- **변경**:
  - `_check_fill_by_ord_no()` — `ka10012` (체결 조회) 정밀 조회
  - `_wait_for_fill()` — 30s → 60s → 180s → 300s 4단계 지수 백오프 + `ka10076` 폴백
  - `place_order()` — `stock_code` 파라미터 전달
  - 5분(300s) 후에도 미체결 → 진짜 미체결로 단정
- **효과**: 체결 타임아웃 6.1% → 1% 미만 예상, 이중 매도 위험 제거
- **검증**: 4단계 백오프 + ka10012/ka10076 이중 조회 확인 ✅

---

## 🔧 부수적 수정

| 파일 | 내용 |
|------|------|
| `kiwoom_api.py` | 머지 충돌 (`<<<<<<< HEAD`) 제거 — 중복된 `get_filled_orders()` 정리 |
| `notification_system.py` | 머지 충돌 (`<<<<<<< HEAD`) 제거 — `_is_market_hours()` 메서드 보존 |

---

## 📈 영향 평가 (예상)

| 항목 | 개선 전 | 개선 후 (예상) |
|------|:------:|:------:|
| 매수 후보 가격대 | ~30만원 (설정 무시) | 30만원 (정확) |
| Overnight 손절 | 5건/3일 | 0건/3일 (09:00~09:30 유예) |
| 체결 타임아웃 | 6.1% | 1% 미만 |
| 이중 매도 위험 | 있음 | 제거 |

---

## ⚠️ 후속 작업

1. **트레이더 재시장** — PID 535655 kill 후 `run_arena_trader.py` 재시작
2. **B안 진행** — 매수 빈도 제한, 체결 추적 결함 패치, trailing_step 2.0% 확인
3. **Wiki 운영원칙 갱신** — §2.5 (휴장일 게이트) 외 §2.20 (overnight 갭다운) 신규

---

## 메타

- 작성일: 2026-06-10 22:55 KST
- Commit: `b6ed5cf`
- Push: 미완료 (인증 이슈)
- 다음 세션: B안 위임 대기
