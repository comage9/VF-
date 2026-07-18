"""VF 출차 관리 대시보드 — Django views (Flask app.py 이식)"""
import json, os, datetime, re, time, urllib.request, urllib.parse, threading, queue as _queue
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

# KPP MCP 서버 함수 직접 import (CDPHandle, do_set_plt, do_edi_print)
import sys as _sys
_sys.path.insert(0, r'E:\coding\skill\KPP\kpp-mcp-server')
from server import CDPHandle, do_set_plt, do_edi_print

# 경로 설정
APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
TEMPLATE_PATH = os.path.join(APP_DIR, "templates", "departure", "dashboard.html")

# 차량 DB 로드
VEHICLES = []
vehicles_path = os.path.join(DATA_DIR, "vehicle_db_merged.json")
if os.path.isfile(vehicles_path):
    try:
        with open(vehicles_path, "r", encoding="utf-8") as f:
            VEHICLES = json.load(f)
    except Exception:
        pass

# 데이터 저장소 (모듈 레벨 — 단일 프로세스 가정)
LS_DATA = []
KPP_DATA = []

# 설정 로드
CONFIG = {}
config_path = os.path.join(DATA_DIR, "config.json")
if os.path.isfile(config_path):
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            CONFIG = json.load(f)
    except Exception:
        pass

# 기동 시 ls_data.json 자동 로드 (마이그레이션 호환: 일별 파일이 있으면 그것부터 우선)
TODAY = datetime.date.today().strftime("%Y-%m-%d")


def _ls_data_path_for(date_str):
    """날짜별 ls_data 파일 경로. 일별 파일 우선, 없으면 공통 파일."""
    if not date_str:
        date_str = TODAY
    daily = os.path.join(DATA_DIR, f"ls_data_{date_str}.json")
    if os.path.isfile(daily):
        return daily
    return os.path.join(DATA_DIR, "ls_data.json")


from departure.models import DepartureRecord


def _normalize_hub(hub: str) -> str:
    """착지 허브 정규화. PDF 오파싱 값(Date/Time 등)은 기본 부천1 HUB로 보정."""
    h = (hub or "").strip()
    if not h:
        return "부천1 HUB"
    up = h.upper()
    # 배차 전표 헤더 오인식 값
    if (
        up in ("DATE/TIME", "DATE", "TIME")
        or "DATE" in up
        or ("TIME" in up and "HUB" not in up)
    ):
        return "부천1 HUB"
    if "HUB" not in up:
        return "부천1 HUB"
    # "부천1HUB" → "부천1 HUB"
    if not re.search(r"\sHUB$", h, re.I) and re.search(r"HUB$", h, re.I):
        h = re.sub(r"HUB$", " HUB", h, flags=re.I)
    return h


def load_ls_data_by_date(date_str):
    """지정 날짜의 ls_data 로드 (없으면 빈 리스트). DB departure_records 테이블에서 조회."""
    if not date_str:
        date_str = TODAY
    try:
        records = DepartureRecord.objects.filter(date=date_str).order_by('hoche')
        result = []
        for r in records:
            hub = _normalize_hub(r.hub)
            # DB에 잘못된 hub가 남아 있으면 즉시 보정 저장
            if r.hub != hub:
                DepartureRecord.objects.filter(pk=r.pk).update(hub=hub)
            result.append({
                "plate": r.plate,
                "driver": r.driver_name,
                "name": r.driver_name,
                "driverName": r.driver_name,
                "driverPhone": r.driver_phone,
                "phone": r.driver_phone,
                "ton": r.ton,
                "original_ton": r.original_ton,
                "hoche": r.hoche,
                "time": r.time,
                "date": str(r.date),
                "plt": r.plt,
                "hub": hub,
                "isNew": r.is_new,
                "slipNo": r.slip_no,
                "barcode": r.barcode,
                "lastSeen": r.last_seen,
                "totalOrders": r.total_orders,
                "seals": {
                    "leftWing": r.seal_left_wing,
                    "rightWing": r.seal_right_wing,
                    "backDoor": r.seal_back_door
                }
            })
        return result
    except Exception as e:
        print(f"Error loading departure records: {e}")
        return []


def save_ls_data_by_date(date_str, data):
    """지정 날짜의 ls_data를 DB에 저장."""
    if not date_str:
        date_str = TODAY
    try:
        # DB에서 전달받은 호차 외의 다른 호차는 삭제 처리
        incoming_hoches = [v.get("hoche") for v in (data or []) if v.get("hoche")]
        DepartureRecord.objects.filter(date=date_str).exclude(hoche__in=incoming_hoches).delete()
        
        for v in (data or []):
            hoche = v.get("hoche")
            if not hoche:
                continue
            seals = v.get("seals") or {}
            DepartureRecord.objects.update_or_create(
                date=date_str,
                hoche=hoche,
                defaults={
                    "plate": v.get("plate", ""),
                    "driver_name": v.get("driverName") or v.get("driver") or v.get("name") or "",
                    "driver_phone": v.get("driverPhone") or v.get("phone") or "",
                    "ton": v.get("ton", "5T"),
                    "original_ton": v.get("original_ton", "5T"),
                    "time": v.get("time", ""),
                    "plt": v.get("plt", 0),
                    "hub": _normalize_hub(v.get("hub", "")),
                    "is_new": v.get("isNew", False),
                    "slip_no": v.get("slipNo") or v.get("slip_no") or "",
                    "barcode": v.get("barcode", ""),
                    "last_seen": v.get("lastSeen") or v.get("last_seen") or "-",
                    "total_orders": v.get("totalOrders", 0),
                    "seal_left_wing": seals.get("leftWing", ""),
                    "seal_right_wing": seals.get("rightWing", ""),
                    "seal_back_door": seals.get("backDoor", ""),
                }
            )
    except Exception as e:
        print(f"Error saving departure records: {e}")
    return ""


def _ensure_ls_loaded_for(date_str):
    """요청 날짜의 데이터가 모듈 캐시에 없으면 로드."""
    global LS_DATA
    LS_DATA = load_ls_data_by_date(date_str)


def is_plate_match(p1, p2):
    p1_clean = p1.replace(" ", "")
    p2_clean = p2.replace(" ", "")
    if not p1_clean or not p2_clean:
        return False
    if p1_clean == p2_clean:
        return True
    n1 = re.sub(r'[^0-9]', '', p1_clean)
    n2 = re.sub(r'[^0-9]', '', p2_clean)
    if len(n1) >= 4 and len(n2) >= 4 and n1[-4:] == n2[-4:]:
        h1 = set(re.sub(r'[0-9a-zA-Z]', '', p1_clean))
        h2 = set(re.sub(r'[0-9a-zA-Z]', '', p2_clean))
        if h1.intersection(h2) or n1 in n2 or n2 in n1:
            return True
    if (len(p1_clean) >= 5 and p1_clean in p2_clean) or (len(p2_clean) >= 5 and p2_clean in p1_clean):
        return True
    return False


def _norm_plate(plate: str) -> str:
    return (plate or "").replace(" ", "").strip()


def _plate_history_index():
    """
    접안 이력 SoT: departure_records DB + vehicle_db_merged.json dates 병합.
    returns { plate_clean: set(['YYYY-MM-DD', ...]) }
    """
    hist = {}
    # 1) DB — 최신 출차 기록 (JSON 마스터보다 우선·최신)
    try:
        rows = (
            DepartureRecord.objects.exclude(plate="")
            .exclude(plate="수배중")
            .exclude(plate="-")
            .values_list("plate", "date")
        )
        for plate, d in rows:
            key = _norm_plate(plate)
            if not key or key in ("수배중", "-"):
                continue
            ds = d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", ds):
                hist.setdefault(key, set()).add(ds)
    except Exception as e:
        print(f"plate history DB load error: {e}")

    # 2) 차량 마스터 JSON (DB 이전 이력 보완)
    for db_v in VEHICLES:
        key = _norm_plate(db_v.get("plateNumber", ""))
        if not key:
            continue
        for d in db_v.get("dates") or []:
            ds = str(d)[:10]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", ds):
                hist.setdefault(key, set()).add(ds)
    return hist


def _history_dates_for_plate(plate: str, hist: dict) -> set:
    key = _norm_plate(plate)
    if not key:
        return set()
    if key in hist:
        return set(hist[key])
    # 퍼지 매칭 (끝 4자리 등)
    merged = set()
    for k, dates in hist.items():
        if is_plate_match(k, key):
            merged |= dates
    return merged


def _find_vehicle_master(plate: str):
    """차량 마스터에서 plate 매칭 (정확 → 퍼지)."""
    if not plate:
        return None
    exact = None
    for db_v in VEHICLES:
        if _norm_plate(db_v.get("plateNumber", "")) == _norm_plate(plate):
            exact = db_v
            break
    if exact:
        return exact
    best = None
    for db_v in VEHICLES:
        if is_plate_match(db_v.get("plateNumber", ""), plate):
            if best is None or (
                db_v.get("driverName")
                and db_v.get("driverName") not in ("[DELETED]", "")
            ):
                best = db_v
    return best


def _persist_dock_stats(enriched: list):
    """enrich 결과를 departure_records.last_seen / total_orders / is_new 에 반영 (변경분만)."""
    for v in enriched or []:
        date_str = (v.get("date") or "").strip()
        hoche = v.get("hoche")
        if not date_str or not hoche:
            continue
        plate = (v.get("plate") or "").strip()
        if not plate or plate in ("수배중", "-"):
            continue
        new_seen = v.get("lastSeen") or "-"
        new_total = int(v.get("totalOrders") or 0)
        new_is_new = bool(v.get("isNew"))
        try:
            qs = DepartureRecord.objects.filter(date=date_str, hoche=hoche)
            row = qs.values("last_seen", "total_orders", "is_new").first()
            if not row:
                continue
            if (
                (row.get("last_seen") or "-") == new_seen
                and int(row.get("total_orders") or 0) == new_total
                and bool(row.get("is_new")) == new_is_new
            ):
                continue
            qs.update(
                last_seen=new_seen,
                total_orders=new_total,
                is_new=new_is_new,
            )
        except Exception as e:
            print(f"persist dock stats error ({date_str} h{hoche}): {e}")


def touch_vehicle_master_dates(plate: str, dock_date: str, *, driver: str = "", phone: str = "", ton: str = ""):
    """
    차량 마스터 JSON에 접안일 반영 (dates 배열 갱신).
    변경이 있을 때만 파일 기록.
    """
    global VEHICLES
    key = _norm_plate(plate)
    ds = (dock_date or "")[:10]
    if not key or key in ("수배중", "-") or not re.match(r"^\d{4}-\d{2}-\d{2}$", ds):
        return False
    matched = None
    for v in VEHICLES:
        if _norm_plate(v.get("plateNumber", "")) == key or is_plate_match(
            v.get("plateNumber", ""), plate
        ):
            matched = v
            break
    changed = False
    if matched is None:
        matched = {
            "plateNumber": plate.replace(" ", ""),
            "driverName": driver or "",
            "driverPhone": phone or "",
            "ton": ton or "5T",
            "dates": [ds],
        }
        VEHICLES.append(matched)
        changed = True
    else:
        dates = set(str(d)[:10] for d in (matched.get("dates") or []) if d)
        if ds not in dates:
            dates.add(ds)
            matched["dates"] = sorted(dates)
            changed = True
        if driver and not (matched.get("driverName") or "").strip():
            matched["driverName"] = driver
            changed = True
        if phone and not (matched.get("driverPhone") or "").strip():
            matched["driverPhone"] = phone
            changed = True
        if ton and not (matched.get("ton") or "").strip():
            matched["ton"] = ton
            changed = True
    if not changed:
        return False
    try:
        with open(vehicles_path, "w", encoding="utf-8") as f:
            json.dump(VEHICLES, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"vehicle master save error: {e}")
        return False


def enrich_ls_data(data, *, persist: bool = True):
    """
    접안일/접안횟수: DB 출차 이력(+마스터 dates)으로 재계산.
    as_of = 해당 레코드 날짜 (없으면 오늘) — 그 이전 접안만 집계.
    """
    today = datetime.date.today().strftime("%Y-%m-%d")
    hist = _plate_history_index()
    enriched = []
    for v in data:
        ev = dict(v) if isinstance(v, dict) else {}
        plate = (ev.get("plate") or "").strip()
        as_of = (ev.get("date") or today)[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", as_of):
            as_of = today

        last_seen = "-"
        total_orders = 0
        is_new = True

        matched_v = _find_vehicle_master(plate) if plate else None
        all_dates = _history_dates_for_plate(plate, hist) if plate else set()

        past_dates = sorted(d for d in all_dates if d < as_of)
        if past_dates:
            last_seen = past_dates[-1]
            total_orders = len(past_dates)
            is_new = False

        if matched_v:
            # Fill missing fields ONLY if not already present in LS data
            if not (ev.get("driver") or "").strip():
                db_driver = matched_v.get("driverName", "") or ""
                if db_driver.endswith(".0"):
                    db_driver = ""
                ev["driver"] = db_driver or ev.get("driverName", "") or ""
                ev["name"] = ev["driver"]
            if not (ev.get("phone") or "").strip():
                ev["phone"] = (
                    (matched_v.get("driverPhone", "") or "")
                    or ev.get("driverPhone", "")
                    or ev.get("phone", "")
                    or ""
                )
            if not (ev.get("ton") or "").strip():
                ev["ton"] = matched_v.get("ton", "5T")

        ev["isNew"] = is_new
        ev["lastSeen"] = last_seen
        ev["totalOrders"] = total_orders
        if "date" not in ev or not ev.get("date"):
            ev["date"] = today
        enriched.append(ev)

    if persist and enriched:
        _persist_dock_stats(enriched)
        # 마스터 dates 도 동기화 (당일 차량)
        for v in enriched:
            pl = (v.get("plate") or "").strip()
            d = (v.get("date") or "").strip()
            if pl and d and pl not in ("수배중", "-"):
                touch_vehicle_master_dates(
                    pl,
                    d,
                    driver=v.get("driver") or v.get("driverName") or "",
                    phone=v.get("phone") or v.get("driverPhone") or "",
                    ton=v.get("ton") or "",
                )
    return enriched


def load_deleted_placeholders():
    path = os.path.join(DATA_DIR, "deleted_placeholders.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_deleted_placeholders(data):
    path = os.path.join(DATA_DIR, "deleted_placeholders.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ───────────────────── Views ─────────────────────

def render_page(request):
    """메인 대시보드 페이지 (HTML) — ?date=YYYY-MM-DD 쿼리로 날짜별 데이터 로드"""
    if not os.path.isfile(TEMPLATE_PATH):
        return HttpResponse("Dashboard template not found", status=404)
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        html = f.read()
    # 쿼리 파라미터 ?date=YYYY-MM-DD → 일별 파일에서 로드 (다른 컴퓨터에서도 동일 데이터)
    req_date = (request.GET.get("date") or "").strip()
    if req_date and re.match(r"^\d{4}-\d{2}-\d{2}$", req_date):
        target_date = req_date
    else:
        target_date = datetime.date.today().strftime("%Y-%m-%d")
    date_ls_data = load_ls_data_by_date(target_date)
    enriched_ls = enrich_ls_data(date_ls_data)
    html = html.replace("__LS_DATA__", json.dumps(enriched_ls, ensure_ascii=False))
    html = html.replace("__KPP_DATA__", json.dumps(KPP_DATA, ensure_ascii=False))
    html = html.replace("__TODAY__", target_date)
    # 캐시 방지 (SPA fetch / 브라우저 구 HTML 유지 문제)
    resp = HttpResponse(html)
    resp["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp["Pragma"] = "no-cache"
    return resp


def render_barcode_scanner(request):
    """scanner 페이지를 Django에서 직접 서빙 (Vite proxy의 SSE 비호환 회피).
    public/ 의 barcode_scanner.html 을 그대로 반환. origin이 같아져서 SSE가 정상 동작.
    """
    scanner_path = os.path.abspath(os.path.join(APP_DIR, "..", "..", "frontend", "client", "public", "barcode_scanner.html"))
    if not os.path.isfile(scanner_path):
        return HttpResponse("barcode_scanner.html not found", status=404)
    with open(scanner_path, "r", encoding="utf-8") as f:
        html = f.read()
    return HttpResponse(html)


def api_vehicles(request):
    q = request.GET.get("q", "").strip()
    if q:
        r = [v for v in VEHICLES if q in v.get("plateNumber", "") or q in v.get("name", "") or q in v.get("driverName", "")]
        return JsonResponse({"results": r[:20], "total": len(r)})
    return JsonResponse({"total": len(VEHICLES)})


def api_vehicle(request, plate):
    p = plate.replace(" ", "")
    for v in VEHICLES:
        if v.get("plateNumber", "").replace(" ", "") == p:
            return JsonResponse(v)
    m = [v for v in VEHICLES if p in v.get("plateNumber", "")]
    if m:
        return JsonResponse(m[0])
    return JsonResponse({"error": "not found"}, status=404)


@csrf_exempt
def api_deleted_placeholders(request):
    if request.method == "POST":
        raw = json.loads(request.body)
        date_str = raw.get("date")
        deleted = raw.get("deleted", {})
        all_data = load_deleted_placeholders()
        all_data[date_str] = deleted
        save_deleted_placeholders(all_data)
        return JsonResponse({"ok": True})
    date_str = request.GET.get("date", datetime.date.today().strftime("%Y-%m-%d"))
    all_data = load_deleted_placeholders()
    return JsonResponse({"deleted": all_data.get(date_str, {})})


@csrf_exempt
def api_ls_data(request):
    """LS 차량 데이터 (날짜별 저장).
    GET  /api/ls-data?date=YYYY-MM-DD → 해당 날짜의 enriched LS 데이터 반환
    POST /api/ls-data  body { date?, vehicles: [...] } → 일별 파일에 저장
    """
    global LS_DATA
    if request.method == "POST":
        raw = json.loads(request.body)
        target_date = (request.GET.get("date") or "").strip()
        if isinstance(raw, dict):
            target_date = target_date or raw.get("date")
            arr = raw.get("vehicles", raw)
        else:
            arr = raw
            if isinstance(raw, list) and len(raw) > 0:
                target_date = target_date or raw[0].get("date")
        if not target_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", target_date):
            target_date = TODAY
            
        if isinstance(arr, dict):
            arr = [arr]
        # original_ton 보정
        for v in arr:
            if "original_ton" not in v or not v.get("original_ton"):
                v["original_ton"] = v.get("ton", "5T")
            v["date"] = target_date
        # 일별 파일에 저장
        save_ls_data_by_date(target_date, arr)
        # 모듈 캐시도 동기화 (다른 API 호출에서 즉시 보이도록)
        # 기존 LS_DATA에서 동일 날짜 항목 제거 후 새 데이터로 교체
        LS_DATA = [v for v in LS_DATA if v.get("date") != target_date] + arr
        return JsonResponse({"ok": True, "count": len(arr), "date": target_date,
                              "data": enrich_ls_data(arr)})
    # GET
    req_date = (request.GET.get("date") or "").strip()
    if req_date and re.match(r"^\d{4}-\d{2}-\d{2}$", req_date):
        target_date = req_date
    else:
        target_date = TODAY
    date_ls_data = load_ls_data_by_date(target_date)
    return JsonResponse({"data": enrich_ls_data(date_ls_data),
                          "date": target_date,
                          "updated": datetime.datetime.now().isoformat()})


@csrf_exempt
def api_vehicle_order(request):
    """
    차량 순서 텍스트 적용 (호차 번호순 정렬).
    POST body: { "date": "YYYY-MM-DD", "text": "1호\\t..." } 또는 { "lines": [...] }
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "POST only"}, status=405)
    try:
        raw = json.loads(request.body or b"{}")
    except Exception:
        return JsonResponse({"ok": False, "error": "invalid JSON"}, status=400)

    target_date = (raw.get("date") or request.GET.get("date") or "").strip()
    if not target_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", target_date):
        target_date = TODAY

    lines = raw.get("lines")
    if not lines:
        text = raw.get("text") or raw.get("order") or ""
        lines = [ln.strip() for ln in str(text).splitlines() if ln.strip()]

    if not lines:
        return JsonResponse({"ok": False, "error": "입력 내용이 없습니다."}, status=400)

    from .services.vehicle_order import vehicle_order_service

    try:
        parsed = vehicle_order_service.reorder_from_input(target_date, lines)
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)

    if not parsed:
        return JsonResponse(
            {
                "ok": False,
                "error": "파싱할 수 있는 데이터가 없습니다. 각 줄에 호차(N호 또는 [N호])와 차량번호가 포함되어야 합니다.",
                "parsed": 0,
            },
            status=400,
        )

    # 저장 후 전체 목록 반환 (seal 등 기존 필드 유지)
    data = load_ls_data_by_date(target_date)
    global LS_DATA
    LS_DATA = [v for v in LS_DATA if v.get("date") != target_date] + data
    return JsonResponse(
        {
            "ok": True,
            "date": target_date,
            "parsed": len(parsed),
            "order": parsed,
            "data": enrich_ls_data(data),
            "count": len(data),
        }
    )


@csrf_exempt
def api_kpp_data(request):
    global KPP_DATA
    if request.method == "POST":
        KPP_DATA = json.loads(request.body)
        with open(os.path.join(DATA_DIR, "kpp_data.json"), "w", encoding="utf-8") as f:
            json.dump(KPP_DATA, f, ensure_ascii=False, indent=2)
        return JsonResponse({"ok": True, "count": len(KPP_DATA)})
    return JsonResponse({"data": KPP_DATA, "updated": datetime.datetime.now().isoformat()})


@csrf_exempt
def api_dispatch_request(request):
    """VF67 배차 요청 메시지 → Telegram"""
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "POST required"}, status=405)

    # 오늘 날짜 데이터만 사용
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    today_data = load_ls_data_by_date(today_str)
    if not today_data:
        return JsonResponse({"ok": False, "error": "등록된 차량이 없습니다"}, status=400)

    tg_config = CONFIG.get("telegram", {})
    bot_token = tg_config.get("bot_token")
    chat_id = tg_config.get("chat_id")

    if not bot_token or not chat_id:
        return JsonResponse({"ok": False, "error": "Telegram 설정(config.json) 누락"}, status=500)

    m = datetime.date.today().month
    d = datetime.date.today().day
    date_str = f"{m}/{d}"

    lines = [f"VF67 - {date_str} 배차 요청 드립니다"]
    for v in today_data:
        hub = v.get("hub", "부천1 HUB")
        ton = v.get("ton", "")
        time = v.get("time", "")
        hoche = v.get("hoche", "")
        parts = [hub, ton]
        if time:
            parts.append(time)
        parts.append(f"{hoche}차")
        lines.append(" ".join(parts))
    lines.append("상기와 같이 배차 진행 부탁드립니다")
    text = "\n".join(lines)

    try:
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
        if result.get("ok"):
            return JsonResponse({"ok": True, "message": "배차 요청이 전송되었습니다", "text": text})
        return JsonResponse({"ok": False, "error": result.get("description", "전송 실패")}, status=500)
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


def debug(request):
    return JsonResponse({
        "app_dir": APP_DIR,
        "template_path": TEMPLATE_PATH,
        "template_exists": os.path.exists(TEMPLATE_PATH),
        "ls_data_len": len(LS_DATA),
    })


@csrf_exempt
def api_print(request, hoche):
    """LS PDF 출력 전용 (봉인씰 합성 포함). KPP 연동 없음."""
    plt = int(request.GET.get("plt", "0"))
    results = []
    ok = True

    from .services.vehicle_order import vehicle_order_service

    target_date = (request.GET.get("date") or "").strip()
    if not target_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", target_date):
        target_date = datetime.date.today().strftime("%Y-%m-%d")

    # 호차로 차량번호 찾기 (DB 기준)
    current_order = vehicle_order_service.get_today_order(target_date)
    vehicle = None
    for v in current_order:
        if v.get("hoche") == hoche:
            vehicle = v
            break

    if not vehicle or not vehicle.get("plate"):
        return JsonResponse({"ok": False, "hoche": hoche, "results": ["차량 정보 없음"]}, status=404)

    dash_plate = vehicle.get("plate", "").strip()
    seals = vehicle.get("seals", {"leftWing": "", "rightWing": "", "backDoor": ""})

    # PDF: 차량번호 본문 일치 파일만 (호차 파일명 fallback은 본문 검증 필수)
    ls_pdf = vehicle_order_service.get_pdf_path(dash_plate, target_date)
    if not ls_pdf:
        for candidate in (
            os.path.join(DATA_DIR, "ls_pdfs", target_date, f"{hoche}_slip.pdf"),
            os.path.join(DATA_DIR, "ls_pdfs", f"{hoche}_slip.pdf"),
        ):
            if os.path.isfile(candidate) and vehicle_order_service._pdf_matches_plate(candidate, dash_plate):
                ls_pdf = candidate
                break

    if ls_pdf and os.path.isfile(ls_pdf):
        try:
            # 봉인씰: GET 파라미터 우선, 없으면 DB 저장값
            seal_left = (request.GET.get("seal_leftWing") or "").strip() or seals.get("leftWing", "")
            seal_right = (request.GET.get("seal_rightWing") or "").strip() or seals.get("rightWing", "")
            seal_back = (request.GET.get("seal_backDoor") or "").strip() or seals.get("backDoor", "")

            if seal_left or seal_right or seal_back:
                import fitz as _fitz
                tmp_pdf = ls_pdf + ".sealed.pdf"
                doc = _fitz.open(ls_pdf)
                page = doc[0]
                if seal_left:
                    page.insert_text((175, 252), seal_left, fontsize=10, fontname="helv")
                if seal_right:
                    page.insert_text((310, 252), seal_right, fontsize=10, fontname="helv")
                if seal_back:
                    page.insert_text((502, 252), seal_back, fontsize=10, fontname="helv")
                doc.save(tmp_pdf)
                doc.close()
                ls_pdf = tmp_pdf
                results.append(f"🔒 봉인씰 합성: L={seal_left or '-'}, R={seal_right or '-'}, B={seal_back or '-'}")

            # 봉인씰 저장 (GET으로 넘어온 값이 있을 때만)
            if request.GET.get("seal_leftWing") or request.GET.get("seal_rightWing") or request.GET.get("seal_backDoor"):
                vehicle_order_service.save_seals(dash_plate, target_date, {
                    "leftWing": seal_left,
                    "rightWing": seal_right,
                    "backDoor": seal_back,
                })

            # GDI 다이렉트 인쇄 우선 (PDF 뷰어 연동 회피), 실패 시 ShellExecute
            try:
                import win32ui
                from PIL import Image, ImageWin
                import fitz as _fitz
                from io import BytesIO

                doc = _fitz.open(ls_pdf)
                page = doc[0]
                pix = page.get_pixmap(dpi=300)
                img = Image.open(BytesIO(pix.tobytes("png")))
                doc.close()

                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC("Canon G2010 series")
                printable_width = hDC.GetDeviceCaps(110)   # PHYSICALWIDTH
                printable_height = hDC.GetDeviceCaps(111)  # PHYSICALHEIGHT

                hDC.StartDoc(f"LS_{hoche}_{dash_plate}")
                hDC.StartPage()
                img_w, img_h = img.size
                ratio = min(printable_width / img_w, printable_height / img_h)
                new_w = int(img_w * ratio)
                new_h = int(img_h * ratio)
                dib = ImageWin.Dib(img)
                x_offset = (printable_width - new_w) // 2
                y_offset = (printable_height - new_h) // 2
                dib.draw(hDC.GetHandleOutput(), (x_offset, y_offset, x_offset + new_w, y_offset + new_h))
                hDC.EndPage()
                hDC.EndDoc()
                hDC.DeleteDC()
                results.append(f"✅ GDI 다이렉트 인쇄: {hoche}호차({dash_plate}) 전송 완료")
            except Exception as pe:
                results.append(f"⚠️ 다이렉트 인쇄 실패 ({pe}) ➡️ ShellExecute 백업")
                import win32api
                win32api.ShellExecute(0, "printto", ls_pdf, '"Canon G2010 series"', ".", 0)
                results.append(f"✅ LS PDF 출력: {hoche}호차({dash_plate}) 완료 ({os.path.basename(ls_pdf)})")
        except Exception as e:
            results.append(f"⚠️ LS PDF 출력 오류: {e}")
            ok = False
    else:
        results.append(f"⚠️ LS PDF 없음: {dash_plate} ({target_date})")
        ok = False

    return JsonResponse({"ok": ok, "hoche": hoche, "results": results})


def api_ls_pdf_status(request):
    return JsonResponse({"printed": False, "message": "개발 중"})


@csrf_exempt
def api_vehicle_extras(request):
    """PLT, 출고시간, 권역 수량 등을 날짜별로 서버에 저장.
    GET  /api/vehicle-extras?date=YYYY-MM-DD → {extras: {1: {plt:12, departTime:"20:00", EAST:4, ...}}}
    POST /api/vehicle-extras  body {date, extras: {1: {...}, 2: {...}}} → 파일에 저장
    """
    extras_dir = DATA_DIR
    if request.method == "POST":
        raw = json.loads(request.body)
        date_str = raw.get("date") or TODAY
        extras = raw.get("extras", {})
        path = os.path.join(extras_dir, f"vehicle_extras_{date_str}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(extras, f, ensure_ascii=False, indent=2)
        return JsonResponse({"ok": True, "date": date_str, "count": len(extras)})
    # GET
    date_str = request.GET.get("date") or TODAY
    path = os.path.join(extras_dir, f"vehicle_extras_{date_str}.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                extras = json.load(f)
            return JsonResponse({"extras": extras, "date": date_str})
        except Exception:
            pass
    return JsonResponse({"extras": {}, "date": date_str})


@csrf_exempt
def api_ls_sync(request):
    """LS 데이터 동기화 — DB 기반 (LS API 차단으로 PDF 수동 등록 대체).
    GET  /api/ls-sync?date=YYYY-MM-DD → 해당 날짜 DB 데이터 반환
    POST /api/ls-sync body { date?, vehicles: [...] } → DB에 저장
    """
    if request.method == "POST":
        # POST: vehicles 데이터를 직접 DB에 저장
        raw = json.loads(request.body)
        target_date = request.GET.get("date") or raw.get("date") or datetime.date.today().strftime("%Y-%m-%d")
        vehicles = raw.get("vehicles", raw) if isinstance(raw, dict) else raw
        if isinstance(vehicles, dict):
            vehicles = [vehicles]
        for v in vehicles:
            v.setdefault("date", target_date)
            v.setdefault("original_ton", v.get("ton", "5T"))
        save_ls_data_by_date(target_date, vehicles)
        return JsonResponse({"ok": True, "count": len(vehicles), "date": target_date,
                              "data": enrich_ls_data(vehicles)})

    # GET: DB 데이터 반환
    date_str = request.GET.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    data = load_ls_data_by_date(date_str)
    return JsonResponse({
        "ok": True,
        "date": date_str,
        "count": len(data),
        "vehicles": enrich_ls_data(data),
        "source": "db",  # LS API 차단으로 DB 기반으로 변경
        "message": "LS API 차단 (CloudFront 403) — PDF 수동 등록 필요"
    })


# ────────────────────────────────────────────────────────────────
# Barcode Scanner 다중 컴퓨터 공유 API
# ────────────────────────────────────────────────────────────────
BARCODE_SUBSCRIBERS = {}      # date_str -> list[queue.Queue]
BARCODE_SUBSCRIBERS_LOCK = threading.Lock()


def _barcode_path(date_str):
    return os.path.join(DATA_DIR, f"barcode_{date_str}.json")


def _barcode_load_from_disk(date_str):
    """디스크에서 저장된 데이터를 읽어옴. 없으면 None."""
    path = _barcode_path(date_str)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _barcode_save_to_disk(date_str, payload):
    """디스크에 저장 + 모든 SSE 구독자에게 변경 알림."""
    payload["updated_at"] = datetime.datetime.now().isoformat()
    path = _barcode_path(date_str)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with BARCODE_SUBSCRIBERS_LOCK:
        subscribers = list(BARCODE_SUBSCRIBERS.get(date_str, []))
    for q in subscribers:
        try:
            q.put_nowait({"type": "update", "date": date_str})
        except Exception:
            pass


@csrf_exempt
def api_barcode_save(request):
    """scanner 데이터 저장.
    POST body: { date?: "YYYY-MM-DD", parsed_text, col_indices, rows, flagged_indices, current_index }
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "POST only"}, status=405)

    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({"ok": False, "error": "invalid json"}, status=400)

    date_str = body.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    payload = {
        "date": date_str,
        "parsed_text": body.get("parsed_text", ""),
        "col_indices": body.get("col_indices", {}),
        "rows": body.get("rows", []),
        "flagged_indices": sorted(list(body.get("flagged_indices", []))),
        "current_index": int(body.get("current_index", 0)),
        "location_overrides": body.get("location_overrides") or {},
    }
    _barcode_save_to_disk(date_str, payload)
    return JsonResponse({
        "ok": True,
        "date": date_str,
        "rows": len(payload["rows"]),
        "flagged": len(payload["flagged_indices"]),
        "updated_at": payload["updated_at"],
    })


@csrf_exempt
def api_barcode_load(request):
    """저장된 scanner 데이터 로드. GET ?date=YYYY-MM-DD"""
    date_str = request.GET.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    data = _barcode_load_from_disk(date_str)
    if data is None:
        return JsonResponse({"ok": True, "exists": False, "date": date_str})
    return JsonResponse({"ok": True, "exists": True, "date": date_str, "data": data})


@csrf_exempt
def api_barcode_clear(request):
    """저장된 scanner 데이터 초기화(삭제). DELETE or POST, ?date=YYYY-MM-DD"""
    date_str = request.GET.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    path = _barcode_path(date_str)
    removed = False
    if os.path.isfile(path):
        try:
            os.remove(path)
            removed = True
        except Exception as e:
            return JsonResponse({"ok": False, "error": str(e)}, status=500)

    with BARCODE_SUBSCRIBERS_LOCK:
        subscribers = list(BARCODE_SUBSCRIBERS.get(date_str, []))
    for q in subscribers:
        try:
            q.put_nowait({"type": "clear", "date": date_str})
        except Exception:
            pass

    return JsonResponse({"ok": True, "date": date_str, "removed": removed})


def api_barcode_subscribe(request):
    """SSE 스트림. 다른 컴퓨터 변경분을 실시간 push.
    GET /api/barcode/subscribe?date=YYYY-MM-DD
    """
    from django.http import StreamingHttpResponse
    date_str = request.GET.get("date") or TODAY

    def event_stream():
        q = _queue.Queue(maxsize=16)
        with BARCODE_SUBSCRIBERS_LOCK:
            BARCODE_SUBSCRIBERS.setdefault(date_str, []).append(q)
        try:
            current = _barcode_load_from_disk(date_str)
            yield f"data: {json.dumps({'type': 'hello', 'date': date_str, 'exists': current is not None}, ensure_ascii=False)}\n\n"
            last_payload_version = None
            if current is not None:
                last_payload_version = current.get("updated_at", "")
                yield f"data: {json.dumps({'type': 'snapshot', 'date': date_str, 'data': current}, ensure_ascii=False)}\n\n"

            while True:
                try:
                    evt = q.get(timeout=15)
                except _queue.Empty:
                    yield ":\n\n"
                    continue

                if evt.get("type") == "clear":
                    yield f"data: {json.dumps({'type': 'clear', 'date': date_str}, ensure_ascii=False)}\n\n"
                    last_payload_version = None
                    continue

                if evt.get("type") == "update":
                    latest = _barcode_load_from_disk(date_str)
                    if latest is None:
                        yield f"data: {json.dumps({'type': 'clear', 'date': date_str}, ensure_ascii=False)}\n\n"
                        last_payload_version = None
                        continue
                    version = latest.get("updated_at", "")
                    if version == last_payload_version:
                        continue
                    last_payload_version = version
                    yield f"data: {json.dumps({'type': 'snapshot', 'date': date_str, 'data': latest}, ensure_ascii=False)}\n\n"
        finally:
            with BARCODE_SUBSCRIBERS_LOCK:
                subs = BARCODE_SUBSCRIBERS.get(date_str, [])
                if q in subs:
                    subs.remove(q)

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp


@csrf_exempt
def api_ls_download_scan(request):
    """Downloads 폴더의 로지스밀 PDF 파일을 즉각 스캔하여 DB화"""
    if request.method not in ("POST", "GET"):
        return JsonResponse({"ok": False, "error": "POST or GET required"}, status=405)
    
    from .downloader_parser import scan_downloads_folder
    res = scan_downloads_folder()
    return JsonResponse(res)


# ────────────────────────────────────────────────────────────────
# Downloads 폴더 자동 감시 백그라운드 데몬 (10분 주기)
# ────────────────────────────────────────────────────────────────
def _start_downloads_watcher():
    def watcher_loop():
        # Django 기동 후 초기 로드 안정화 대기
        time.sleep(15)
        while True:
            try:
                from .downloader_parser import scan_downloads_folder
                res = scan_downloads_folder()
                if res.get("ok") and res.get("new_count", 0) > 0:
                    print(f"[Auto-Watcher] Scanned downloads folder. Registered {res['new_count']} new vehicles.")
            except Exception:
                pass
            time.sleep(600)  # 10분 대기

    t = threading.Thread(target=watcher_loop, daemon=True)
    t.start()

# 모듈 로드 시 데몬 시작
_start_downloads_watcher()