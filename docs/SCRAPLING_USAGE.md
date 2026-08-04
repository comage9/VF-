# Scrapling 활용 가이드 (VF-new)

**라이브러리:** [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling)  
**문서:** https://scrapling.readthedocs.io/en/latest/  
**작성:** 2026-07-21

---

## 1. 왜 Scrapling 인가

| 기능 | VF 활용 |
|------|---------|
| **FetcherSession + impersonate** | LS/KPP HTTP API를 Chrome TLS 지문으로 호출 (Akamai·봇 필터 완화) |
| **StealthyFetcher** | Cloudflare/봇 차단 HTML 페이지 조회 |
| **DynamicFetcher** | Playwright 기반 SPA/JS 화면 |
| **adaptive CSS** | 사이트 DOM 변경 시 셀렉터 재탐색 (HTML 파싱 시) |

공식 import (중요 — 구버전 `from scrapling import Fetcher` 는 폐기):

```python
from scrapling.fetchers import Fetcher, FetcherSession, StealthyFetcher, DynamicFetcher
```

---

## 2. 설치

```bash
cd backend
.venv\Scripts\pip install "scrapling[fetchers]"
scrapling install          # Dynamic/Stealthy 브라우저 (최초 1회)
```

`requirements.txt` 에 `scrapling[fetchers]>=0.4.0` 포함.

---

## 3. VF 코드 위치

| 파일 | 역할 |
|------|------|
| `backend/scrapling_client.py` | **단일 진입점** — http_get_json / http_get_bytes / stealth_get_html / dynamic_get_html |
| `backend/ls_automation.py` | LS 주문 JSON·PDF: Scrapling 1순위, curl_cffi 폴백 |
| `backend/kpp_automation.py` | KPP 프로브(Stealthy) + CDP 세션 위임 |
| `backend/kpp_session.py` | WPPS 로그인·PBM140 이동 (Chrome CDP, SpreadJS 조작) |

---

## 4. LS 파이프라인에서의 사용

```
patchright 로그인 → 쿠키
    ↓
Scrapling FetcherSession.get(truckOrderTracking)  ← JSON
    ↓ 실패 시 curl_cffi
PDF: Scrapling FetcherSession.get(slip/generate) → bytes
    ↓
Downloads → scan_downloads_folder → Departure 등록
```

```python
from scrapling_client import http_get_json, SCRAPLING_READY

res = http_get_json(
    "https://ls.coupang.com/data/truckOrderTracking?...",
    cookies=cookies,
    headers={"Accept": "application/json", "Referer": "https://ls.coupang.com/"},
    impersonate="chrome",
)
orders = res["data"]["data"]["content"]  # ok 일 때
```

---

## 5. KPP 파이프라인에서의 사용

```
[선택] Scrapling StealthyFetcher → 로그인 HTML/셀렉터 확인
[필수] Chrome CDP (kpp_session) → 로그인 UI + PBM140MW SpreadJS
[조회] 쿠키 확보 후 Scrapling FetcherSession 으로 보조 HTTP 가능
[출력] Departure [📦 KPP] → do_edi_print (CDP)
```

```bash
# Scrapling 으로 로그인 페이지 프로브
python kpp_automation.py --probe-login

# 브라우저 띄워 로그인 → 출하통보등록 (함께 진행)
python kpp_session.py --step all
# 또는
python kpp_automation.py --session all
```

**참고:** PBM140MW 그리드(SpreadJS) 셀 조작·EDI 버튼은 CDP JS 주입이 검증되어 있음.  
Scrapling DynamicFetcher 로 전면 교체는 가능하나 1차는 **조회=Scrapling, 조작=CDP** 하이브리드.

---

## 6. Fetcher 선택 표

| 상황 | 클래스 |
|------|--------|
| JSON API + 쿠키 (LS 주문) | `FetcherSession(impersonate='chrome')` |
| PDF 바이너리 | 동일 + body bytes |
| 봇 차단 로그인 HTML | `StealthyFetcher` / `StealthySession` |
| 복잡한 SPA 클릭 | `DynamicFetcher` 또는 기존 CDP |

---

## 7. 상태 확인

```bash
cd backend
python -c "from scrapling_client import status; print(status())"
```

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-21 | 공식 `scrapling.fetchers` API 로 통일, scrapling_client 추가, LS/KPP 연동 |
