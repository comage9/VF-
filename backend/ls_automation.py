# -*- coding: utf-8 -*-
"""
LS 포털 자동화 - 차량 배정 모니터링 + PDF 자동 다운로드 + Departure 즉시 등록

동작 흐름:
1. patchright 로 Akamai 우회 로그인
2. Scrapling Fetcher / curl_cffi 로 VF67_H 주문 조회
3. ls_orders_{date}.json 저장 (접안 requestTime 오름차순)
4. 배정 차량 LinehaulSlip PDF -> Downloads/ (접안시간 순)
5. scan_downloads_folder() → Departure 호차·기사 등록 (1호=가장 이른 접안)

실행:
  python ls_automation.py                 # 1회
  python ls_automation.py --watch         # 매일 15:00~ 확인, 완료 시 다음날 15:00까지 대기(프로세스 유지)
  python ls_automation.py --watch --keep-watching  # 당일 완료 후에도 23시까지 재접속
  python ls_automation.py --watch --once-day       # 하루만 처리 후 종료
"""
import os
import sys
import json
import time
import argparse
from datetime import datetime, timedelta

# Windows cp949 콘솔/리다이렉트 로그에서 UnicodeEncodeError 방지
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

# Scrapling 공식 API (https://github.com/D4Vinci/Scrapling)
#   from scrapling.fetchers import FetcherSession  — scrapling_client 경유
try:
    from scrapling_client import SCRAPLING_READY, http_get_json, http_get_bytes, status as scrapling_status
except Exception:
    SCRAPLING_READY = False
    scrapling_status = lambda: {"ready": False}  # noqa: E731

    def http_get_json(*a, **k):
        return {"ok": False, "error": "scrapling_client missing", "data": None}

    def http_get_bytes(*a, **k):
        return {"ok": False, "error": "scrapling_client missing", "content": b""}

if not SCRAPLING_READY:
    print("[LS] Scrapling 미사용 가능 - curl_cffi 폴백. pip install \"scrapling[fetchers]\"")

# .env 로드
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
DOWNLOADS_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
DATA_DIR = os.path.join(BASE_DIR, "departure", "data")

LS_PORTAL_URL = "https://ls.coupang.com/"
LS_ORDER_API = "https://ls.coupang.com/data/truckOrderTracking"  # truckOrderTracking 페이지 API
LS_PDF_URL = "https://ls.coupang.com/linehaul/slip/generate"
LS_LOCATION = "VF67_H"  # VF67 유원피에스 HUB

# VF 호차 매핑 (truckOrderTemplateId → 호차) — 2026-07 실데이터
# 1호 20:00=90626, 2호 22:xx=90628, 3호 23:50=90269
VF_TEMPLATE_HOCHE = {
    90626: 1,
    90628: 2,
    90269: 3,
}


def load_env():
    """.env 파일에서 LS_ID, LS_PASSWORD 읽기"""
    env = {}
    if os.path.isfile(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env


def login_and_get_cookies(ls_id: str, ls_pw: str) -> dict:
    """
    patchright로 LS 포털 로그인 후 쿠키 반환.
    Akamai Bot Manager 우회를 위해 patchright(스텔스 Playwright) 사용.
    """
    try:
        return _login_and_get_cookies_impl(ls_id, ls_pw)
    except Exception as e:
        print(f"[LS] 로그인 예외: {type(e).__name__}: {e}")
        sys.stdout.flush()
        return {}


def _login_and_get_cookies_impl(ls_id: str, ls_pw: str) -> dict:
    from patchright.sync_api import sync_playwright

    cookies = {}
    with sync_playwright() as p:
        # headless=False가 Akamai 우회율이 더 높음 (headless 탐지 회피)
        # 서버/백그라운드 환경에서는 Xvfb 등 가상 디스플레이 필요할 수 있음
        browser = p.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ]
        )
        context = browser.new_context(viewport={"width": 1366, "height": 900})
        page = context.new_page()

        # 1. LS 포털 접속 → 로그인 페이지로 리다이렉트
        page.goto(LS_PORTAL_URL, timeout=30000)
        page.wait_for_load_state("networkidle", timeout=20000)

        # 2. 로그인 폼이 렌더링될 때까지 대기 (Keycloak SPA 렌더링 시간)
        try:
            page.wait_for_selector("#username", timeout=10000)
        except:
            pass  # 이미 로그인된 상태일 수 있음

        # 3. 로그인 폼이 있으면 입력
        if page.locator("#username").count() > 0:
            page.fill("#username", ls_id)
            page.fill("#password", ls_pw)
            page.click("#kc-login")
            # 로그인 후 LS 포털로 리다이렉트 대기
            try:
                page.wait_for_url("**/ls.coupang.com/**", timeout=20000)
            except:
                page.wait_for_load_state("networkidle", timeout=20000)
            print(f"[LS] 로그인 완료: {page.url[:60]}")
        else:
            # 로그인 폼이 없으면 이미 로그인된 상태인지 확인
            if "ls.coupang.com" in page.url and "xauth" not in page.url:
                print(f"[LS] 이미 로그인됨: {page.url[:60]}")
            else:
                print(f"[LS] ⚠️ 로그인 페이지 도달 실패: {page.url[:60]}")

        # 4. 쿠키 수집 (모든 도메인)
        for cookie in context.cookies():
            cookies[cookie["name"]] = cookie["value"]

        browser.close()

    print(f"[LS] 획득한 쿠키 수: {len(cookies)}")
    return cookies


def fetch_orders(cookies: dict, target_date: str) -> list:
    """
    1순위: Scrapling FetcherSession (chrome TLS impersonate)
    2순위: curl_cffi 폴백
    VF67_H only.
    """
    url = (
        f"{LS_ORDER_API}?"
        f"statuses=CONFIRMED,BACK&"
        f"orderStartDate={target_date}&orderEndDate={target_date}&"
        f"locationStart={LS_LOCATION}&"
        f"page=0&pageSize=200"
    )

    headers = {
        "Accept": "application/json",
        "Referer": "https://ls.coupang.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    }

    # --- Scrapling (공식: scrapling.fetchers.FetcherSession) ---
    if SCRAPLING_READY:
        res = http_get_json(url, cookies=cookies, headers=headers, impersonate="chrome", timeout=25)
        if res.get("ok") and isinstance(res.get("data"), dict):
            data = res["data"]
            content = data.get("data", {}).get("content", []) if isinstance(data, dict) else []
            total = data.get("data", {}).get("totalElements", 0) if isinstance(data, dict) else len(content)
            print(f"[LS] Scrapling FetcherSession 사용 ({res.get('engine')})")
            print(f"[LS] {target_date} VF67_H 전체: {total}건, 조회: {len(content)}건")
            return content or []
        print(f"[LS] Scrapling 실패 → curl_cffi 폴백: {res.get('error')}")

    # --- Fallback curl_cffi ---
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        print("[LS] curl_cffi 없음 - 주문 조회 불가")
        return []

    resp = cffi_requests.get(
        url,
        headers=headers,
        cookies=cookies,
        impersonate="chrome",
        timeout=20,
    )
    if resp.status_code != 200:
        print(f"[LS] API 호출 실패: {resp.status_code}")
        return []
    data = resp.json()
    content = data.get("data", {}).get("content", [])
    total = data.get("data", {}).get("totalElements", 0)
    print(f"[LS] curl_cffi 폴백 | {target_date} VF67_H 전체: {total}건, 조회: {len(content)}건")
    return content


def download_pdf(cookies: dict, truck_request_id: int, save_dir: str) -> str | None:
    """
    LinehaulSlip PDF 다운로드.
    1순위 Scrapling FetcherSession, 2순위 curl_cffi.
    """
    url = f"{LS_PDF_URL}?truckRequestId={truck_request_id}&locale=ko_KR"
    headers = {
        "Referer": "https://ls.coupang.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    }

    content = b""
    if SCRAPLING_READY:
        res = http_get_bytes(url, cookies=cookies, headers=headers, impersonate="chrome", timeout=45)
        if res.get("ok") and len(res.get("content") or b"") > 1000:
            content = res["content"]
            print(f"  [PDF] Scrapling 다운로드 ({len(content)//1024}KB)")
        else:
            print(f"  [PDF] Scrapling 실패 → curl_cffi: {res.get('error')}")

    if len(content) <= 1000:
        try:
            from curl_cffi import requests as cffi_requests

            resp = cffi_requests.get(
                url,
                headers=headers,
                cookies=cookies,
                impersonate="chrome",
                timeout=30,
            )
            if resp.status_code == 200 and len(resp.content) > 1000:
                content = resp.content
            else:
                print(
                    f"  [PDF] {truck_request_id}: 실패 "
                    f"(status={resp.status_code}, size={len(resp.content)})"
                )
                return None
        except Exception as e:
            print(f"  [PDF] {truck_request_id}: 에러 {e}")
            return None

    if len(content) <= 1000:
        return None

    filename = f"LinehaulSlip-{truck_request_id}.pdf"
    save_path = os.path.join(save_dir, filename)
    with open(save_path, "wb") as f:
        f.write(content)
    return save_path


def get_assigned_vehicles(orders: list) -> list:
    """배정된 차량(plateNumber 있음)만 필터링"""
    assigned = []
    for o in orders:
        ti = o.get("truckInfo", {}) or {}
        if ti.get("plateNumber"):
            assigned.append(o)
    return assigned


def is_already_downloaded(truck_request_id: int) -> bool:
    """이미 다운로드된 PDF인지 확인"""
    # Downloads 폴더 확인
    for suffix in ["", " (1)", " (2)"]:
        path = os.path.join(DOWNLOADS_DIR, f"LinehaulSlip-{truck_request_id}{suffix}.pdf")
        if os.path.isfile(path):
            return True
    # processed_slips.json 확인
    slips_path = os.path.join(DATA_DIR, "processed_slips.json")
    if os.path.isfile(slips_path):
        try:
            with open(slips_path, encoding="utf-8") as f:
                if str(truck_request_id) in json.load(f):
                    return True
        except Exception:
            pass
    return False


def _ensure_django():
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    from django.apps import apps

    if not apps.ready:
        django.setup()


def _count_registered_plates(target_date: str) -> int:
    """Departure DB에 plate 있는 당일 차량 수 (LS 접속 없이)."""
    try:
        _ensure_django()
        from departure.models import DepartureRecord
        from datetime import date as _date

        d = _date.fromisoformat(str(target_date)[:10])
        return (
            DepartureRecord.objects.filter(date=d)
            .exclude(plate__isnull=True)
            .exclude(plate="")
            .count()
        )
    except Exception as e:
        print(f"[LS] 등록 수 조회 스킵: {e}")
        return 0


def _vehicle_info_target(target_date: str, fallback_min: int = 1) -> int:
    """
    목표 대수 = Departure 차량 정보(plate) 수.
    0대면 fallback (LS 선등록 모드 — LS 배정 수를 따름).
    """
    n = _count_registered_plates(target_date)
    return n if n > 0 else max(1, fallback_min)


def check_day_complete_local(
    target_date: str,
    min_vehicles: int = 3,
) -> tuple:
    """
    LS 포털 접속 없이 로컬만으로 완료 여부 판단.

    기본 배차 = min_vehicles(3) 대.
    1·3호만 먼저 배차된 경우(M=2) 완료로 보지 않고 end_hour까지 LS 재확인.

    완료 조건 (모두 충족):
      · LS 배정 M >= min_vehicles
      · Departure 등록 N >= min_vehicles
      · M > N 이면 UI 확인 대기 (미완료)
      · 필요 PDF 전부 다운로드

    반환: (done: bool, reason: str)
    """
    min_vehicles = max(1, int(min_vehicles or 3))
    orders_path = os.path.join(DATA_DIR, f"ls_orders_{target_date}.json")
    if not os.path.isfile(orders_path):
        return False, "주문 JSON 없음 - LS 조회 필요"

    try:
        with open(orders_path, encoding="utf-8") as f:
            orders = json.load(f) or []
    except Exception as e:
        return False, f"주문 JSON 읽기 실패: {e}"

    assigned = [
        o
        for o in orders
        if (o.get("plateNumber") or o.get("plate") or "").strip()
    ]
    n_assigned = len(assigned)  # M
    n_reg = _count_registered_plates(target_date)  # N

    # ── 핵심: 기본 3대 미만이면 절대 완료 아님 (2대만 배차 후 중단 버그 수정) ──
    if n_assigned < min_vehicles:
        return (
            False,
            f"LS 배정 {n_assigned}대 < 최소 {min_vehicles}대 - 추가 배차 대기",
        )
    if n_reg < min_vehicles:
        return (
            False,
            f"Departure 등록 {n_reg}대 < 최소 {min_vehicles}대 - 등록/LS 대기",
        )

    if n_reg > 0 and n_assigned > n_reg:
        return (
            False,
            f"LS {n_assigned}대 > 차량정보 {n_reg}대 — UI 확인 필요 (자동 추가 안 함)",
        )

    # PDF: 등록 plate 매칭 LS 주문 전부, 부족 시 전체 배정분
    need_ids = []
    reg_plates = set()
    try:
        _ensure_django()
        from departure.models import DepartureRecord
        from datetime import date as _date

        d = _date.fromisoformat(str(target_date)[:10])
        for p in (
            DepartureRecord.objects.filter(date=d)
            .exclude(plate="")
            .values_list("plate", flat=True)
        ):
            reg_plates.add("".join(str(p).split()))
    except Exception:
        pass
    for o in assigned:
        ti = o.get("truckInfo") or {}
        plate = (ti.get("plateNumber") or o.get("plateNumber") or o.get("plate") or "")
        plate = "".join(str(plate).split())
        if plate in reg_plates or not reg_plates:
            tid = o.get("truckRequestId")
            if tid is not None:
                need_ids.append(tid)
    if len(need_ids) < n_assigned:
        need_ids = [
            o.get("truckRequestId")
            for o in assigned
            if o.get("truckRequestId") is not None
        ]

    missing_pdf = [str(tid) for tid in need_ids if tid and not is_already_downloaded(tid)]
    if missing_pdf:
        return False, f"PDF 미다운로드 {len(missing_pdf)}건: {missing_pdf[:5]}"

    if n_reg < n_assigned:
        return False, f"Departure 등록 {n_reg}대 < LS {n_assigned}대"

    return (
        True,
        f"완료: 차량정보 {n_reg} | LS {n_assigned} | 최소 {min_vehicles} | PDF OK",
    )


def _order_request_epoch(o: dict) -> int:
    """접안/요청 시각 epoch (호차·다운로드 순서 SoT)."""
    v = o.get("requestTimeEpoch")
    if v is None:
        v = o.get("requestTime")
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _write_orders_json(target_date: str, assigned: list) -> str:
    """ls_orders_{date}.json — requestTime 오름차순 (1호차 = 가장 이른 접안). LS = SoT."""
    os.makedirs(DATA_DIR, exist_ok=True)
    orders_json_path = os.path.join(DATA_DIR, f"ls_orders_{target_date}.json")
    orders_summary = []
    for o in sorted(assigned, key=_order_request_epoch):
        ti = o.get("truckInfo", {}) or {}
        orders_summary.append(
            {
                "truckRequestId": o.get("truckRequestId"),
                "templateId": o.get("truckOrderTemplateId"),
                "plateNumber": ti.get("plateNumber"),
                "driverName": ti.get("driverName") or ti.get("name"),
                "driverPhone": ti.get("driverPhone") or ti.get("phone"),
                "requestTimeEpoch": _order_request_epoch(o) or None,
                "orderDate": o.get("orderDate"),
                "status": o.get("status"),
                # 봉인: API 필드명 변형 흡수
                "sealLeft": o.get("sealLeft") or o.get("sealLeftNo"),
                "sealRight": o.get("sealRight") or o.get("sealRightNo"),
                "sealBack": o.get("sealBack") or o.get("sealBackNo"),
            }
        )
    with open(orders_json_path, "w", encoding="utf-8") as f:
        json.dump(orders_summary, f, ensure_ascii=False, indent=2)
    print(f"[LS] 주문 정보 저장: {orders_json_path} ({len(orders_summary)}건, 접안시간순 · LS SoT)")
    return orders_json_path


def run_once(target_date: str = None, max_downloads: int = 10) -> dict:
    """
    1회 실행: 로그인 → 조회 → PDF 다운로드 → Departure 등록
    반환: 결과 요약 dict
    """
    env = load_env()
    ls_id = env.get("LS_ID", "")
    ls_pw = env.get("LS_PASSWORD", "")

    if not ls_id or not ls_pw:
        return {"ok": False, "error": "LS_ID/LS_PASSWORD가 .env에 없습니다"}

    if target_date is None:
        target_date = datetime.now().strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f"[LS 자동화] {target_date} 실행 시작 {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*60}")
    sys.stdout.flush()

    # 1. 로그인 → 쿠키 획득
    cookies = login_and_get_cookies(ls_id, ls_pw)
    if not cookies:
        return {"ok": False, "error": "로그인 실패 (쿠키 없음)"}

    # 2. 차량 주문 조회 (VF67_H)
    orders = fetch_orders(cookies, target_date)
    if not orders:
        # 0건도 JSON 기록 → 감시/UI에서 '배차 대기' 판별 가능
        _write_orders_json(target_date, [])
        msg = (
            f"{target_date} VF67_H 조회 0건 — LS에 배차(CONFIRMED) 없음. "
            f"배차되면 다음 주기에 PDF·Departure 등록"
        )
        print(f"[LS] {msg}")
        sys.stdout.flush()
        return {
            "ok": True,
            "total": 0,
            "assigned": 0,
            "downloaded": 0,
            "skipped": 0,
            "waiting_dispatch": True,
            "message": msg,
        }

    # 3. 배정된 차량 필터링 + 접안시간 순 정렬
    assigned = get_assigned_vehicles(orders)
    assigned = sorted(assigned, key=_order_request_epoch)
    print(f"[LS] 배정 완료: {len(assigned)}건 (접안시간 빠른 순 → 1호차)")

    # 3-1. API 응답 JSON (downloader_parser 호차 SoT)
    _write_orders_json(target_date, assigned)

    if not assigned:
        msg = (
            f"{target_date} 주문 {len(orders)}건 있으나 번호판 배정 0건 — "
            f"차량 배정 대기"
        )
        print(f"[LS] {msg}")
        sys.stdout.flush()
        return {
            "ok": True,
            "total": len(orders),
            "assigned": 0,
            "downloaded": 0,
            "skipped": 0,
            "waiting_dispatch": True,
            "message": msg,
        }

    for i, o in enumerate(assigned, 1):
        ti = o.get("truckInfo", {}) or {}
        print(
            f"  [{i}호 예정] id={o.get('truckRequestId')} "
            f"plate={ti.get('plateNumber')} driver={ti.get('driverName')} "
            f"epoch={_order_request_epoch(o)}"
        )

    # 4. PDF 다운로드 (접안시간 순 = 호차 순)
    downloaded = []
    skipped = []
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)

    for o in assigned:
        if len(downloaded) >= max_downloads:
            break
        tid = o.get("truckRequestId")
        if not tid:
            continue
        if is_already_downloaded(tid):
            skipped.append(tid)
            print(f"  스킵(이미 있음): ID:{tid}")
            continue

        ti = o.get("truckInfo", {}) or {}
        print(f"  다운로드: ID:{tid} | {ti.get('plateNumber')} | {ti.get('driverName')}")
        sys.stdout.flush()

        save_path = download_pdf(cookies, tid, DOWNLOADS_DIR)
        if save_path:
            size_kb = os.path.getsize(save_path) // 1024
            print(f"    OK {size_kb}KB")
            downloaded.append(tid)
            time.sleep(1)  # 서버 부하 방지

    # 5. Departure: PDF 스캔 등록 + LS 값으로 시간·호차·봉인 강제 동기화
    scan_res = trigger_departure_scan(target_date=target_date)

    result = {
        "ok": True,
        "date": target_date,
        "total": len(orders),
        "assigned": len(assigned),
        "downloaded": len(downloaded),
        "skipped": len(skipped),
        "downloaded_ids": downloaded,
        "registered": (scan_res or {}).get("new_count", 0),
        "ls_synced": (scan_res or {}).get("ls_synced", 0),
        "scan": scan_res,
        "message": (
            f"다운로드 {len(downloaded)}건, 스킵 {len(skipped)}건, "
            f"등록 {(scan_res or {}).get('new_count', 0)}건, "
            f"LS동기화 {(scan_res or {}).get('ls_synced', 0)}건"
        ),
    }
    print(f"\n[LS] 완료: {result['message']}")
    sys.stdout.flush()
    return result


def trigger_departure_scan(target_date: str = None) -> dict:
    """
    Downloads LinehaulSlip PDF → Departure 등록 후
    ls_orders JSON(LS SoT)으로 접안시간·호차·봉인 덮어쓰기.
    """
    try:
        _ensure_django()
        from departure.downloader_parser import scan_downloads_folder
        from departure.services.vehicle_order import vehicle_order_service

        day = target_date or datetime.now().strftime("%Y-%m-%d")
        res = scan_downloads_folder() or {}
        # 차량정보 유지 + 미입력만 LS 채움 / N=0이면 LS 선등록 추가
        try:
            sync = vehicle_order_service.sync_from_ls_orders(day) or {}
            res["ls_synced"] = (sync.get("updated") or 0) + (sync.get("added") or 0)
            res["ls_sync"] = sync
            res["compare"] = sync.get("compare") or vehicle_order_service.compare_ls_vehicle_info(day)
            # LS > 차량정보 플래그 파일 (UI 확인 창용)
            cmp = res["compare"]
            flag_path = os.path.join(DATA_DIR, f"ls_pending_confirm_{day}.json")
            if cmp.get("needs_confirm"):
                with open(flag_path, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            **cmp,
                            "updated_at": datetime.now().isoformat(timespec="seconds"),
                        },
                        f,
                        ensure_ascii=False,
                        indent=2,
                    )
                print(
                    f"[LS] 확인 대기: LS {cmp.get('ls_count')} > "
                    f"차량정보 {cmp.get('vehicle_info_count')} → {flag_path}"
                )
            elif os.path.isfile(flag_path):
                try:
                    os.remove(flag_path)
                except Exception:
                    pass
        except Exception as se:
            print(f"[LS] LS merge 동기화 스킵: {se}")
            res["ls_synced"] = 0
        # 기사명 빈 칸 PDF 재추출
        try:
            n = vehicle_order_service.backfill_missing_drivers(day)
            if n:
                res["drivers_backfilled"] = n
        except Exception as be:
            print(f"[LS] 기사명 백필 스킵: {be}")
        print(
            f"[LS] Departure 등록 스캔: ok={res.get('ok')} "
            f"new={res.get('new_count', 0)} "
            f"ls_synced={res.get('ls_synced', 0)} "
            f"dates={res.get('synced_dates')}"
        )
        return res
    except Exception as e:
        print(f"[LS] Departure 스캔 실패: {e}")
        return {"ok": False, "error": str(e), "new_count": 0, "ls_synced": 0}


def _sleep_until(dt: datetime, label: str = ""):
    """지정 시각까지 대기 (최대 1시간 단위로 깨워 로그)."""
    while True:
        now = datetime.now()
        wait = (dt - now).total_seconds()
        if wait <= 0:
            return
        mins = int(wait // 60)
        msg = f"[대기] {label}까지 약 {mins}분" if label else f"[대기] {mins}분"
        print(f"{msg} ({dt.strftime('%Y-%m-%d %H:%M')})")
        sys.stdout.flush()
        time.sleep(min(wait, 3600))


def run_watch(
    start_hour: int = 15,
    interval_minutes: int = 10,
    target_date: str = None,
    end_hour: int = 23,
    stop_when_complete: bool = True,
    min_vehicles: int = 3,
    keep_watching: bool = False,
    daily: bool = True,
):
    """
    정기 실행 모드 (기본 매일 15:00~).

    기본(daily=True):
      - 프로세스를 죽이지 않고 **매일** 반복
      - 매일 start_hour(15) 부터 LS 확인
      - 배차·PDF·Departure 등록 (접안시간 순 호차)
      - 당일 완료 시: 당일 LS 재접속 중단 → **다음날 15:00까지 대기**
      - end_hour 도달 시에도 종료하지 않고 다음날 15:00 대기

    keep_watching=True:
      당일 완료 후에도 end_hour까지 주기 LS 접속 (추가 배차)

    daily=False + target_date 고정:
      예전처럼 해당 날짜만 처리 후 프로세스 종료
    """
    fixed_date = bool(target_date)
    if keep_watching:
        stop_when_complete = False
    # 매일 모드에서는 완료해도 프로세스 유지
    if daily and not fixed_date:
        pass  # stop_when_complete 는 "당일 LS 중단" 의미로만 사용

    print(f"\n{'='*60}")
    print(f"[LS 자동화 - 감시 모드]")
    print(f"  모드: {'매일 반복 (daily)' if (daily and not fixed_date) else '단일 날짜'}")
    print(f"  대상 날짜: {target_date or '오늘(자동 갱신)'}")
    print(f"  실행 시간: 매일 {start_hour}:00 ~ {end_hour}:00")
    print(f"  간격: {interval_minutes}분 (미완료·배차대기 시 LS 접속)")
    print(f"  최소 배정: {min_vehicles}대")
    print(f"  당일 완료 시 LS 중단: {stop_when_complete}")
    print(f"  keep_watching: {keep_watching}")
    print(f"{'='*60}")
    sys.stdout.flush()

    while True:
        now = datetime.now()
        day = target_date if fixed_date else now.strftime("%Y-%m-%d")
        hour = now.hour

        # ── 15:00 이전: 대기 ──
        if hour < start_hour:
            next_run = now.replace(hour=start_hour, minute=0, second=0, microsecond=0)
            _sleep_until(next_run, f"{day} {start_hour}:00 LS 확인")
            continue

        # ── end_hour 이후: 다음날 15:00까지 대기 (프로세스 유지) ──
        if hour >= end_hour:
            if fixed_date and not daily:
                print(f"\n[종료] {end_hour}:00 도달 · 고정 날짜 모드 종료.")
                break
            tomorrow = (now + timedelta(days=1)).replace(
                hour=start_hour, minute=0, second=0, microsecond=0
            )
            print(
                f"\n[일일 마감] {end_hour}:00 지남 → "
                f"다음날 {tomorrow.strftime('%Y-%m-%d %H:%M')} 까지 대기 "
                f"(프로세스 유지)"
            )
            sys.stdout.flush()
            _sleep_until(tomorrow, "다음날 LS 확인")
            continue

        # 날짜 갱신 (자정 넘긴 뒤 15시 창에서)
        if not fixed_date:
            day = datetime.now().strftime("%Y-%m-%d")

        # ── 당일 완료: LS 재접속 없이 다음날까지 대기 ──
        if stop_when_complete and not keep_watching:
            done, reason = check_day_complete_local(day, min_vehicles=min_vehicles)
            print(f"\n[로컬 검사] {day}: {reason}")
            sys.stdout.flush()
            if done:
                if fixed_date and not daily:
                    print(
                        f"\n[종료] {day} PDF·Departure 완료 → 프로세스 종료. "
                        f"({datetime.now().strftime('%H:%M:%S')})"
                    )
                    break
                tomorrow = (datetime.now() + timedelta(days=1)).replace(
                    hour=start_hour, minute=0, second=0, microsecond=0
                )
                # 아직 오늘이면 내일 15:00
                if tomorrow.date() <= datetime.now().date():
                    tomorrow = (datetime.now() + timedelta(days=1)).replace(
                        hour=start_hour, minute=0, second=0, microsecond=0
                    )
                print(
                    f"\n[당일 완료] LS 재접속 안 함 → "
                    f"{tomorrow.strftime('%Y-%m-%d %H:%M')} 까지 대기"
                )
                sys.stdout.flush()
                _sleep_until(tomorrow, "다음날 LS 확인")
                continue

        try:
            result = run_once(day, max_downloads=20)
            msg = (result or {}).get("message", "")
            print(f"[주기 결과] {msg}")
            sys.stdout.flush()

            if stop_when_complete and result.get("ok") and not keep_watching:
                done, reason = check_day_complete_local(day, min_vehicles=min_vehicles)
                print(f"[로컬 검사] {day}: {reason}")
                sys.stdout.flush()
                if done:
                    if fixed_date and not daily:
                        print(f"\n[종료] {day} 처리 완료.")
                        break
                    tomorrow = (datetime.now() + timedelta(days=1)).replace(
                        hour=start_hour, minute=0, second=0, microsecond=0
                    )
                    print(
                        f"\n[당일 완료] 다음날 {tomorrow.strftime('%Y-%m-%d %H:%M')} 대기"
                    )
                    sys.stdout.flush()
                    _sleep_until(tomorrow, "다음날 LS 확인")
                    continue

            if result.get("waiting_dispatch"):
                print(
                    f"\n[배차 대기] {interval_minutes}분 후 LS 재확인 "
                    f"(차량 배정·접안시간 반영 시 등록)"
                )
            elif not result.get("ok"):
                print(f"\n[재시도] 오류 — {interval_minutes}분 후")
            else:
                print(f"\n[대기] 미완료 — {interval_minutes}분 후 LS 재조회")
            sys.stdout.flush()
        except KeyboardInterrupt:
            print("[LS] 사용자 중단")
            raise
        except BaseException as e:
            # patchright/브라우저 크래시도 감시 루프는 유지
            print(f"[에러] {type(e).__name__}: {e}")
            sys.stdout.flush()

        time.sleep(max(1, interval_minutes) * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LS 포털 자동화")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="매일 15:00~ LS 확인·PDF·Departure 등록 (프로세스 유지)",
    )
    parser.add_argument("--date", type=str, help="대상 날짜 (YYYY-MM-DD, 기본: 매일 오늘)")
    parser.add_argument("--start-hour", type=int, default=15, help="감시 시작 시 (기본 15)")
    parser.add_argument("--end-hour", type=int, default=23, help="당일 감시 종료 시 (기본 23)")
    parser.add_argument("--interval", type=int, default=10, help="미완료 시 재시도 간격 분 (기본 10)")
    parser.add_argument("--max", type=int, default=10, help="1회 최대 다운로드 수 (기본 10)")
    parser.add_argument(
        "--min-vehicles",
        type=int,
        default=3,
        help="완료로 볼 최소 배정 대수 (기본 3)",
    )
    parser.add_argument(
        "--keep-watching",
        action="store_true",
        help="당일 완료 후에도 end_hour까지 주기 LS 접속",
    )
    parser.add_argument(
        "--once-day",
        action="store_true",
        help="해당 날짜만 처리 후 프로세스 종료 (매일 반복 끔)",
    )
    args = parser.parse_args()

    if args.watch:
        run_watch(
            start_hour=args.start_hour,
            interval_minutes=args.interval,
            target_date=args.date,
            end_hour=args.end_hour,
            stop_when_complete=not args.keep_watching,
            min_vehicles=args.min_vehicles,
            keep_watching=args.keep_watching,
            daily=not args.once_day,
        )
    else:
        result = run_once(target_date=args.date, max_downloads=args.max)
        print(f"\n최종 결과: {json.dumps(result, ensure_ascii=False, indent=2)}")
