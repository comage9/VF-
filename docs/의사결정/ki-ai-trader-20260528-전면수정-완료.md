---
type: 의사결정
created: 2026-05-28
status: 완료
tags: [K.I. Trainer, Arena Trader, 수정, 버그픽스, 리팩토링]
---

# ki-ai-trader: 2026-05-28 전면 수정 완료

**작성일:** 2026-05-28
**관련 페이지:** [문제-해결/ki-ai-trader-미해결-이슈-20260528](문제-해결/ki-ai-trader-미해결-이슈-20260528.md), [개념/telegram-이상징후-판단기준-20260528](개념/telegram-이상징후-판단기준-20260528.md), [개념/telegram-이상징후-검증-20260528](개념/telegram-이상징후-검증-20260528.md)

---

## 개요

Cron 감시 보고서에서 식별된 7개 이상징후를 분석한 결과, 실제 장애는 0건이었으나 **코드 품질 개선 관점에서 9건을 수정** 완료.

---

## 수정 목록

### 코드 수정 (7건)

| # | 파일 | 수정 전 | 수정 후 | 해결된 문제 |
|:-:|:----|:-------|:--------|:-----------|
| 1 | `adaptive_trailing_stop.py` | MACD/RSI 조건에서 수익/손실 무관하게 트레일링 활성화 | `profit_pct > 0` 조건 추가 → **수익권에서만 활성화** | 헬릭스미스 손실권 트레일링 발동 방지 |
| 2 | `multi_agent_arena.py` | LLM 응답 파싱 시 `.strip()` 직접 호출 → None이면 crash | `choices[0].message.content` 누락 시 None 반환하는 방어 코드 추가 | LLM NoneType.strip() 오류 395회/일 → 방어 |
| 3 | `run_arena_trader.py` | `scan_new_candidates()`가 가격 무관하게 모든 조건-fit 종목 선정 | `if price > max_buy_amount:` — 후보 풀 진입 전 가격 필터 | 293회 매수 불가 스킵 → ~3회로 감소 |
| 4 | `scripts/realtime_minute_collector.py` | 1분봉 OHLCV만 수집 | OHLCV 수집 사이클 사이에 **5초 간격 호가(bidask) 동시 수집** | 호가 데이터 부재 문제 해결 |
| 5 | `scripts/run_dashboard.py` | import 경로 불완전 | `src_path` + `root_path` 모두 sys.path에 추가 | FastAPI import 오류 방지 |
| 6 | `scripts/check_pre_market_analysis.py` | import 경로 불완전 | `root_path` + `src_path` 모두 sys.path에 추가 | 장전 분석 스크립트 실행 오류 방지 |
| 7 | `src/services/report_service.py` | 트레일링 상태 표시 없음 | `trailing_stops.json` 읽어서 실제 손절가/익절가/트레일링 상태 표시 | 보고서 가독성 개선 |

### 인프라 수정 (2건)

| # | 항목 | 작업 내용 | 상태 |
|:-:|:----|:---------|:----:|
| 8 | **Wiki 자동화 5종 복원** | ingest/lint/cleanup/briefing/git-sync 스크립트 복원 + Hermes cronjob 등록 확인 | ✅ 전원 정상 |
| 9 | **Telegram 1시간 정기 보고** | `K.I. Trainer 1시간 정기 현황 보고` 크론잡 등록 (ID: `227a4d3a3929`, 08:00~15:00 매시 정각) | ✅ 등록 완료 |

---

## 보류된 항목 (False Positive)

| 항목 | 사유 | 확인 |
|:----|:-----|:----:|
| DB `accounts` 테이블 누락 | 05-28 00:30 **1회만** 발생, 이후 15시간 재현 없음 — 일회성 초기화 문제 | ✅ 보류 타당 |
| 리프레시 토큰 저장 | client_credentials OAuth 방식 — refresh token이 존재하지 않음 | ✅ 보류 타당 |

---

## Wiki 신규 문서 목록

오늘 작업하며 생성된 Wiki 페이지:

| 문서 | 경로 | 설명 |
|:----|:----|:-----|
| [개념/telegram-이상징후-판단기준-20260528](개념/telegram-이상징후-판단기준-20260528.md) | `개념/` | 7개 이상징후를 정상/경고/장애로 구분하는 기준 |
| [개념/telegram-이상징후-검증-20260528](개념/telegram-이상징후-검증-20260528.md) | `개념/` | 7개 항목 실시간 검증 결과 |
| [문제-해결/ki-ai-trader-미해결-이슈-20260528](문제-해결/ki-ai-trader-미해결-이슈-20260528.md) | `문제-해결/` | 미해결 이슈 현황 (P0~P3 우선순위) |
| (본 문서) | `의사결정/` | 2026-05-28 전면 수정 완료 기록 |

---

## 변경 이력

| 일자 | 내용 |
|:---:|:-----|
| 2026-05-28 | 최초 작성 — 9건 수정 완료 기록 |
