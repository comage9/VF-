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


def save_ls_data_by_date(date_str, data, *, replace: bool = False):
    """
    지정 날짜의 ls_data를 DB에 저장.

    기본(merge): 전달된 호차만 upsert. **없는 호차는 삭제하지 않음.**
    (예전 replace 동작은 클라이언트가 2대만 POST하면 3호가 지워져
     출차카드가 2↔3 깜빡이는 원인.)

    replace=True: 전달 목록에 없는 호차 삭제 (명시적 전체 교체 시에만).
    """
    if not date_str:
        date_str = TODAY
    try:
        rows = list(data or [])
        incoming_hoches = []
        for v in rows:
            hoche = v.get("hoche")
            if not hoche:
                continue
            try:
                hoche = int(hoche)
            except (TypeError, ValueError):
                continue
            incoming_hoches.append(hoche)
            seals = v.get("seals") or {}
            plate = (v.get("plate") or "").strip()
            driver = (
                v.get("driverName") or v.get("driver") or v.get("name") or ""
            ).strip()
            phone = (v.get("driverPhone") or v.get("phone") or "").strip()
            ton = v.get("ton") or "5T"
            original_ton = v.get("original_ton") or ton or "5T"
            time_val = v.get("time") or ""
            plt = v.get("plt", 0) or 0
            hub = _normalize_hub(v.get("hub", ""))
            slip = v.get("slipNo") or v.get("slip_no") or ""
            barcode = v.get("barcode") or ""
            last_seen = v.get("lastSeen") or v.get("last_seen") or "-"
            total_orders = v.get("totalOrders", 0) or 0
            is_new = bool(v.get("isNew", False))
            seal_l = seals.get("leftWing", "") if isinstance(seals, dict) else ""
            seal_r = seals.get("rightWing", "") if isinstance(seals, dict) else ""
            seal_b = seals.get("backDoor", "") if isinstance(seals, dict) else ""

            # plate 우선 매칭 (호차 재정렬 후에도 동일 차량 유지)
            rec = None
            if plate:
                rec = DepartureRecord.objects.filter(date=date_str, plate=plate).first()
            if rec is None:
                rec = DepartureRecord.objects.filter(date=date_str, hoche=hoche).first()

            if rec is not None:
                # 병합: 빈 값으로 기존 LS 확정 데이터를 지우지 않음
                rec.hoche = hoche
                if plate:
                    rec.plate = plate
                if driver:
                    rec.driver_name = driver
                if phone:
                    rec.driver_phone = phone
                if ton:
                    rec.ton = ton
                if original_ton:
                    rec.original_ton = original_ton
                if time_val:
                    rec.time = time_val
                # plt/seals 은 클라이언트 편집값 — 0/빈 문자열도 반영
                rec.plt = int(plt) if plt is not None else rec.plt
                if hub:
                    rec.hub = hub
                rec.is_new = is_new
                if slip:
                    rec.slip_no = slip
                if barcode:
                    rec.barcode = barcode
                if last_seen and last_seen != "-":
                    rec.last_seen = last_seen
                if total_orders:
                    rec.total_orders = int(total_orders)
                # seals: 키가 오면 갱신 (빈 값 = 사용자 지움 허용)
                if isinstance(seals, dict) and seals:
                    if "leftWing" in seals:
                        rec.seal_left_wing = seal_l or ""
                    if "rightWing" in seals:
                        rec.seal_right_wing = seal_r or ""
                    if "backDoor" in seals:
                        rec.seal_back_door = seal_b or ""
                rec.save()
            else:
                DepartureRecord.objects.create(
                    date=date_str,
                    hoche=hoche,
                    plate=plate,
                    driver_name=driver,
                    driver_phone=phone,
                    ton=ton,
                    original_ton=original_ton,
                    time=time_val,
                    plt=int(plt) if plt else 0,
                    hub=hub,
                    is_new=is_new,
                    slip_no=slip,
                    barcode=barcode,
                    last_seen=last_seen,
                    total_orders=int(total_orders) if total_orders else 0,
                    seal_left_wing=seal_l or "",
                    seal_right_wing=seal_r or "",
                    seal_back_door=seal_b or "",
                )

        if replace:
            if incoming_hoches:
                DepartureRecord.objects.filter(date=date_str).exclude(
                    hoche__in=incoming_hoches
                ).delete()
            else:
                # 빈 목록 + replace → 당일 전체 삭제 (초기화)
                DepartureRecord.objects.filter(date=date_str).delete()
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
    resp = HttpResponse(html)
    # 정적 HTML 수정이 브라우저·iframe 캐시에 안 잡히도록
    resp["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp["Pragma"] = "no-cache"
    resp["Expires"] = "0"
    return resp


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
        # 병합 저장 (기본) — 부분 POST로 다른 호차 삭제 금지
        # 전체 교체가 필요하면 ?replace=1
        do_replace = (request.GET.get("replace") or "").strip() in (
            "1",
            "true",
            "yes",
        )
        save_ls_data_by_date(target_date, arr, replace=do_replace)
        # 저장 후 DB 전체 재로드 (클라이언트 부분 목록이 응답에 남아 깜빡임 방지)
        full = load_ls_data_by_date(target_date)
        LS_DATA = [v for v in LS_DATA if v.get("date") != target_date] + full
        return JsonResponse(
            {
                "ok": True,
                "count": len(full),
                "date": target_date,
                "data": enrich_ls_data(full),
                "merged": not do_replace,
            }
        )
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


def _server_printer_name() -> str:
    """서버 PC 프린터 이름 (.env DEPARTURE_PRINTER_NAME, 기본 Canon G2010 series)."""
    return (
        os.environ.get("DEPARTURE_PRINTER_NAME")
        or os.environ.get("LS_PRINTER_NAME")
        or "Canon G2010 series"
    ).strip()


def _print_pdf_on_server(pdf_path: str, job_title: str) -> list:
    """
    반드시 Django 가 돌아가는 **서버 PC** 의 프린터로 출력.
    (클라이언트 브라우저 window.print 사용 금지 — 외부 PC 클릭도 서버에서 인쇄)

    2026-08-09 변경: GDI 비트맵(300dpi 래스터) 경로 제거.
    PDF 원본을 ShellExecute("printto")로 벡터 전송 → 품질 저하 방지.
    프린터는 Canon G2010 series 명시 (Windows 기본=ZM600 라벨 함정 회피).
    """
    results = []
    printer = _server_printer_name()
    try:
        import win32api

        # printto: PDF 벡터 원본을 지정 프린터로 전송 (Acrobat/Edge 핸들러)
        win32api.ShellExecute(
            0, "printto", pdf_path, f'"{printer}"', ".", 0
        )
        results.append(
            f"✅ 서버 printto 전송: {printer} · {job_title} · {os.path.basename(pdf_path)}"
        )
    except Exception as pe:
        results.append(f"❌ 서버 printto 실패: {pe}")
        raise
    return results


@csrf_exempt
def api_print(request, hoche):
    """LS PDF 출력 전용 (봉인씰 합성 포함). KPP 연동 없음.
    인쇄는 항상 API 서버(출차용 PC) 에서 수행 — 외부 브라우저 클릭도 서버 프린터.
    """
    plt = int(request.GET.get("plt", "0"))
    results = []
    ok = True
    client = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR") or "?"

    from .services.vehicle_order import vehicle_order_service

    target_date = (request.GET.get("date") or "").strip()
    if not target_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", target_date):
        target_date = datetime.date.today().strftime("%Y-%m-%d")
    results.append(f"🖥 서버 인쇄 · client={client} · date={target_date}")

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
            # 봉인씰: GET 파라미터 우선 → vehicle → plate+date DB 재조회
            db_seals = vehicle_order_service.get_seals(dash_plate, target_date) or {}
            seal_left = (
                (request.GET.get("seal_leftWing") or "").strip()
                or (seals.get("leftWing") or "").strip()
                or (db_seals.get("leftWing") or "").strip()
            )
            seal_right = (
                (request.GET.get("seal_rightWing") or "").strip()
                or (seals.get("rightWing") or "").strip()
                or (db_seals.get("rightWing") or "").strip()
            )
            seal_back = (
                (request.GET.get("seal_backDoor") or "").strip()
                or (seals.get("backDoor") or "").strip()
                or (db_seals.get("backDoor") or "").strip()
            )
            seal_payload = {
                "leftWing": seal_left,
                "rightWing": seal_right,
                "backDoor": seal_back,
            }

            if seal_left or seal_right or seal_back:
                # 원본 유지, 합성본은 .sealed.pdf (라벨 옆 좌표)
                tmp_pdf = ls_pdf + ".sealed.pdf"
                # 이전 합성본 잔여 방지
                if os.path.isfile(tmp_pdf):
                    try:
                        os.remove(tmp_pdf)
                    except OSError:
                        pass
                ok_seal = vehicle_order_service.compose_seals_on_pdf(
                    ls_pdf, tmp_pdf, seal_payload
                )
                if ok_seal and os.path.isfile(tmp_pdf):
                    ls_pdf = tmp_pdf
                    results.append(
                        f"🔒 봉인씰 합성: L={seal_left or '-'}, "
                        f"R={seal_right or '-'}, B={seal_back or '-'}"
                    )
                else:
                    results.append("⚠️ 봉인씰 합성 실패 — 원본 PDF 출력")
            else:
                results.append(
                    "⚠️ 봉인씰 번호 없음 — 원본 PDF 출력 "
                    "(화면 우측 봉인씰 입력 후 다시 인쇄)"
                )

            # 봉인씰 저장: GET 값이 있거나 합성에 쓸 값이 있으면 plate+date로 유지
            if seal_left or seal_right or seal_back:
                vehicle_order_service.save_seals(dash_plate, target_date, seal_payload)

            # 서버 PC 프린터로만 출력 (클라이언트 로컬 프린터 사용 안 함)
            try:
                results.extend(
                    _print_pdf_on_server(
                        ls_pdf, f"LS_{hoche}_{dash_plate}_{target_date}"
                    )
                )
            except Exception as pe:
                results.append(f"❌ 서버 인쇄 실패: {pe}")
                ok = False
        except Exception as e:
            results.append(f"⚠️ LS PDF 출력 오류: {e}")
            ok = False
    else:
        results.append(f"⚠️ LS PDF 없음: {dash_plate} ({target_date})")
        ok = False

    return JsonResponse(
        {
            "ok": ok,
            "hoche": hoche,
            "results": results,
            "server_print": True,
            "printer": _server_printer_name(),
        }
    )


@csrf_exempt
def api_print_kpp(request, hoche):
    """
    KPP 등록 + EDI 전표 출력 (WPPS PBM140MW).

    1) Departure 해당 호차 차량정보 로드
    2) 화면 파렛트 수량(plt 쿼리)으로 KPP 등록/갱신 (기존 행 있으면 갱신)
    3) EDI 전표 인쇄

    삭제(fn_delete) 없음. 등록→출력만.
    필요: Chrome CDP :9222 + WPPS 로그인 + PBM140 탭
    """
    results = []
    ok = True
    existing_info = None
    is_new = None
    plt = request.GET.get("plt")
    date_str = (request.GET.get("date") or "").strip()
    # 파렛트: 화면 입력값만 사용. 빈칸/0 → 기본 12 강제 금지
    try:
        plt_n = int(plt) if plt not in (None, "") else 0
    except ValueError:
        plt_n = 0
    if plt_n <= 0:
        return JsonResponse(
            {
                "ok": False,
                "hoche": hoche,
                "results": [
                    "❌ 파렛트 수량이 비어 있거나 0입니다. "
                    "출차 카드/차량 정보에서 실제 수량을 입력한 뒤 KPP 등록하세요."
                ],
                "plt": plt_n,
            },
            status=400,
        )

    try:
        backend_root = os.path.dirname(APP_DIR)
        if backend_root not in _sys.path:
            _sys.path.insert(0, backend_root)
        import kpp_session as ks

        # 세션 없으면 로그인·등록 화면까지
        st = ks.step_status()
        if not st.get("on_pbm140"):
            results.append("PBM140 탭 없음 → 로그인/등록 화면 이동 시도")
            login_r = ks.step_login(wait_manual_sec=15)
            if not login_r.get("ok"):
                # 이미 로그인일 수 있음
                results.append(f"login: {login_r}")
            reg_r = ks.step_register()
            results.append(f"register page: {reg_r.get('ok')} {reg_r.get('url')}")
            if not reg_r.get("ok"):
                return JsonResponse(
                    {
                        "ok": False,
                        "hoche": hoche,
                        "results": results
                        + ["❌ PBM140 진입 실패. python kpp_session.py --step all"],
                    },
                    status=400,
                )

        out = ks.register_and_print_from_departure(
            hoche=int(hoche),
            plt=plt_n,
            date_str=date_str or None,
            do_print=True,
        )
        reg = out.get("register") or {}
        prn = out.get("print") or {}
        veh = out.get("vehicle") or {}
        existing = reg.get("existing") or {}
        existing_info = existing
        is_new = reg.get("is_new")
        results.append(
            f"Departure: {veh.get('plate')} / {veh.get('driver')} / PLT={out.get('plt')}"
        )
        # 기존 등록 여부 (중복 방지)
        if existing.get("registered"):
            results.append(
                f"🔍 기존 등록 확인 → 갱신 "
                f"(match={existing.get('match_by')} row={existing.get('target_row')}, 신규 추가 없음)"
            )
        elif reg.get("ok"):
            results.append("🆕 미등록 → 신규 등록")
        results.append(reg.get("message") or str(reg))
        if existing.get("duplicate_hoche") or existing.get("duplicate_plate"):
            results.append(
                "⚠️ 그리드에 동일 호차/차량 중복 행이 이미 있음 (자동 삭제 안 함)"
            )
        post = reg.get("post_check") or {}
        if post.get("duplicate_hoche") or post.get("duplicate_plate"):
            results.append(
                "⚠️ 저장 후에도 중복 행 감지 — WPPS 화면에서 수동 확인 권장"
            )
        if reg.get("verify"):
            results.append(f"검증: {reg.get('verify')}")
        if prn.get("ok"):
            results.append(prn.get("message") or "✅ EDI 인쇄 완료")
            if prn.get("pdf"):
                results.append(f"PDF: {prn.get('pdf')}")
        else:
            ok = False
            results.append(prn.get("error") or "❌ 인쇄 실패")
            # 등록만 성공한 경우 폴백: 기존 do_edi_print
            if reg.get("ok"):
                try:
                    with CDPHandle() as cdp:
                        msg2 = do_edi_print(cdp, int(hoche))
                        results.append(f"폴백 EDI: {msg2}")
                        if not str(msg2).startswith("❌"):
                            ok = True
                except Exception as e2:
                    results.append(f"폴백 EDI 실패: {e2}")
        ok = bool(out.get("ok")) or ok
    except Exception as e:
        ok = False
        err = str(e)
        results.append(f"❌ KPP 오류: {err}")
        if "PBM140" in err or "탭" in err or "CDP" in err:
            results.append("💡 python kpp_session.py --step all 후 재시도")

    return JsonResponse(
        {
            "ok": ok,
            "hoche": hoche,
            "results": results,
            "plt": plt_n,
            "existing": existing_info,
            "is_new": is_new,
        }
    )


@csrf_exempt
def api_kpp_check(request, hoche):
    """
    KPP(PBM140) 기존 차량 등록 여부 확인 (읽기 전용, 등록/삭제 없음).

    GET /departure/api/kpp-check/<hoche>?date=YYYY-MM-DD&plate=...
    plate 생략 시 Departure 해당 호차 차량번호 사용.
    """
    date_str = (request.GET.get("date") or "").strip() or None
    plate = (request.GET.get("plate") or "").strip()
    try:
        backend_root = os.path.dirname(APP_DIR)
        if backend_root not in _sys.path:
            _sys.path.insert(0, backend_root)
        import kpp_session as ks

        if not plate:
            try:
                from departure.services.vehicle_order import vehicle_order_service
                from datetime import date as dt_date

                d = date_str or dt_date.today().strftime("%Y-%m-%d")
                order = vehicle_order_service.get_today_order(d)
                veh = next(
                    (v for v in order if int(v.get("hoche") or 0) == int(hoche)),
                    None,
                )
                if veh:
                    plate = veh.get("plate") or ""
            except Exception as e:
                return JsonResponse(
                    {"ok": False, "error": f"Departure 차량 조회 실패: {e}"},
                    status=400,
                )

        st = ks.step_status()
        if not st.get("on_pbm140"):
            login_r = ks.step_login(wait_manual_sec=10)
            if not login_r.get("ok") and not st.get("ok"):
                return JsonResponse(
                    {
                        "ok": False,
                        "error": "PBM140 세션 없음",
                        "login": login_r,
                        "hint": "python kpp_session.py --step all",
                    },
                    status=400,
                )
            ks.step_register()

        info = ks.check_vehicle_registered(
            hoche=int(hoche),
            plate=plate,
            date_str=date_str,
        )
        return JsonResponse(info)
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


@csrf_exempt
def api_kpp_session(request):
    """
    KPP 세션 헬퍼.
    GET ?step=status|launch|login|register
    """
    step = (request.GET.get("step") or "status").strip().lower()
    try:
        # backend/kpp_session.py
        backend_root = os.path.dirname(APP_DIR)
        if backend_root not in _sys.path:
            _sys.path.insert(0, backend_root)
        import kpp_session as ks

        if step == "launch":
            data = ks.step_launch()
        elif step == "login":
            data = ks.step_login(wait_manual_sec=int(request.GET.get("wait") or 30))
        elif step == "register":
            data = ks.step_register()
        else:
            data = ks.step_status()
        return JsonResponse({"ok": bool(data.get("ok")), "step": step, **data})
    except Exception as e:
        return JsonResponse({"ok": False, "step": step, "error": str(e)}, status=500)


def api_ls_pdf_status(request):
    return JsonResponse({"printed": False, "message": "개발 중"})


def _normalize_vehicle_extras_payload(extras) -> dict:
    """파일/요청 포맷 통일: { '1': {plt, regions, ...}, ... }"""
    if not isinstance(extras, dict):
        return {}
    # 중첩 { "extras": { "1": ... } } 호환
    if (
        "extras" in extras
        and isinstance(extras.get("extras"), dict)
        and not any(str(k).isdigit() for k in extras.keys() if k != "extras")
    ):
        extras = extras["extras"]
    out = {}
    for k, v in extras.items():
        if k in ("extras", "date"):
            continue
        if isinstance(v, dict):
            out[str(k)] = v
    return out


@csrf_exempt
def api_vehicle_extras(request):
    """PLT·시각·권역 수량을 날짜별로 서버에 저장.
    GET  /api/vehicle-extras?date=YYYY-MM-DD
      → {extras: {1: {plt, pltTime, departTime, regions, EAST, ...}}}
    - pltTime: 파렛트 입력 시각 (차량정보 「출고시간」)
    - departTime: 권역(EAST/WEST/…) 입력 시각 (출차카드 「출차시간」)
    POST /api/vehicle-extras  body {date, extras: {1: {...}, 2: {...}}}
    """
    extras_dir = DATA_DIR
    if request.method == "POST":
        raw = json.loads(request.body)
        date_str = raw.get("date") or TODAY
        incoming = _normalize_vehicle_extras_payload(raw.get("extras", {}))
        path = os.path.join(extras_dir, f"vehicle_extras_{date_str}.json")

        # 기존 파일 읽기 (merge 기반)
        existing = {}
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    existing = _normalize_vehicle_extras_payload(json.load(f))
            except Exception:
                existing = {}

        # 호차별 deep merge: 보내지 않은 호차는 기존값 보존,
        # 보낸 호차는 필드 단위로 갱신 (안 보낸 필드는 유지).
        for hoche, data in incoming.items():
            cur = existing.get(hoche, {})
            if isinstance(cur, dict) and isinstance(data, dict):
                cur.update(data)
                existing[hoche] = cur
            else:
                existing[hoche] = data

        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return JsonResponse({
            "ok": True, "date": date_str, "count": len(existing),
            "merged": True, "merged_hoches": list(incoming.keys()),
        })
    # GET
    date_str = request.GET.get("date") or TODAY
    path = os.path.join(extras_dir, f"vehicle_extras_{date_str}.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                extras = _normalize_vehicle_extras_payload(json.load(f))
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
    """Downloads 폴더의 로지스밀 PDF 파일을 즉각 스캔하여 DB화 + LS merge(미입력 채움)."""
    if request.method not in ("POST", "GET"):
        return JsonResponse({"ok": False, "error": "POST or GET required"}, status=405)

    from .downloader_parser import scan_downloads_folder
    from .services.vehicle_order import vehicle_order_service

    date_str = (
        request.GET.get("date")
        or (request.data.get("date") if hasattr(request, "data") else None)
        or datetime.date.today().strftime("%Y-%m-%d")
    )
    if request.method == "POST":
        try:
            body = json.loads(request.body or b"{}")
            if isinstance(body, dict) and body.get("date"):
                date_str = body["date"]
        except Exception:
            pass

    res = scan_downloads_folder() or {}
    try:
        sync = vehicle_order_service.sync_from_ls_orders(date_str) or {}
        res["ls_sync"] = sync
        res["compare"] = sync.get("compare") or vehicle_order_service.compare_ls_vehicle_info(
            date_str
        )
    except Exception as e:
        res["ls_sync_error"] = str(e)
        try:
            res["compare"] = vehicle_order_service.compare_ls_vehicle_info(date_str)
        except Exception:
            pass
    res["vehicles"] = load_ls_data_by_date(date_str)
    return JsonResponse(res)


@csrf_exempt
def api_ls_compare(request):
    """
    차량 정보 N vs LS 배정 M.
    needs_confirm=true 이면 UI에서 확인 창 표시.
    """
    date_str = request.GET.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    from .services.vehicle_order import vehicle_order_service

    cmp = vehicle_order_service.compare_ls_vehicle_info(date_str)
    flag_path = os.path.join(DATA_DIR, f"ls_pending_confirm_{date_str}.json")
    cmp["flag_file"] = os.path.isfile(flag_path)
    return JsonResponse(cmp)


@csrf_exempt
def api_ls_apply_merge(request):
    """
    사용자 확인 후: LS 여분 차량 추가 + 미입력만 채움 + 호차 재정렬.
    POST { date?, confirm: true }
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "POST only"}, status=405)
    try:
        body = json.loads(request.body or b"{}")
    except Exception:
        body = {}
    if not body.get("confirm"):
        return JsonResponse(
            {"ok": False, "error": "confirm=true 필요"}, status=400
        )
    date_str = (
        body.get("date")
        or request.GET.get("date")
        or datetime.date.today().strftime("%Y-%m-%d")
    )
    from .services.vehicle_order import vehicle_order_service

    result = vehicle_order_service.apply_ls_merge_confirmed(date_str)
    flag_path = os.path.join(DATA_DIR, f"ls_pending_confirm_{date_str}.json")
    if os.path.isfile(flag_path):
        try:
            os.remove(flag_path)
        except Exception:
            pass
    vehicles = load_ls_data_by_date(date_str)
    return JsonResponse(
        {
            "ok": bool(result.get("ok")),
            "result": result,
            "vehicles": enrich_ls_data(vehicles),
            "count": len(vehicles),
            "date": date_str,
        }
    )


@csrf_exempt
def api_ls_defer_merge(request):
    """확인 창에서 '대기' — 플래그만 유지/갱신, 자동 추가 안 함."""
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "POST only"}, status=405)
    try:
        body = json.loads(request.body or b"{}")
    except Exception:
        body = {}
    date_str = (
        body.get("date")
        or request.GET.get("date")
        or datetime.date.today().strftime("%Y-%m-%d")
    )
    from .services.vehicle_order import vehicle_order_service

    cmp = vehicle_order_service.compare_ls_vehicle_info(date_str)
    flag_path = os.path.join(DATA_DIR, f"ls_pending_confirm_{date_str}.json")
    with open(flag_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                **cmp,
                "deferred": True,
                "updated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    return JsonResponse({"ok": True, "compare": cmp, "deferred": True})


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


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED
        if handle:
            kernel32.CloseHandle(handle)
            return True
    except Exception:
        pass
    # POSIX / fallback
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def _start_ls_watch_process():
    """
    매일 15:00~ LS PDF 다운로드 + Departure 차량/기사 등록 감시.
    gunicorn/runserver 로드 시 1회 기동. 끄려면 LS_AUTO_WATCH=0.
    프로세스는 매일 반복(daily) — 완료해도 다음날 15:00까지 유지.
    """
    flag = os.getenv("LS_AUTO_WATCH", "1").strip().lower()
    if flag in ("0", "false", "no", "n", "off"):
        print("[LS] 감시 미기동 (LS_AUTO_WATCH=0)")
        return
    # runserver reloader: 부모 프로세스에서는 기동하지 않음 (자식 RUN_MAIN=true 만)
    import sys as _sys

    _argv = " ".join(_sys.argv)
    if "runserver" in _argv and os.environ.get("RUN_MAIN") != "true":
        return
    lock_path = os.path.join(DATA_DIR, ".ls_watch.lock")
    try:
        if os.path.isfile(lock_path):
            try:
                with open(lock_path, "r", encoding="utf-8") as f:
                    old_pid = int((f.read() or "0").strip() or "0")
                if old_pid > 0 and _pid_alive(old_pid):
                    print(f"[LS] 감시 이미 실행 중 (pid={old_pid})")
                    return
            except Exception:
                pass

        import subprocess
        import sys

        backend_dir = os.path.abspath(os.path.join(APP_DIR, ".."))
        # 슈퍼바이저: watch 프로세스가 죽어도 자동 재기동
        ls_script = os.path.join(backend_dir, "ls_watch_supervisor.py")
        if not os.path.isfile(ls_script):
            ls_script = os.path.join(backend_dir, "ls_automation.py")
            extra_args = ["--watch"]
        else:
            extra_args = []
        if not os.path.isfile(ls_script):
            print(f"[LS] ls 감시 스크립트 없음: {ls_script}")
            return
        interval = os.getenv("LS_WATCH_INTERVAL", "10")
        start_h = os.getenv("LS_WATCH_START_HOUR", "15")
        end_h = os.getenv("LS_WATCH_END_HOUR", "23")
        log_path = os.path.join(DATA_DIR, "ls_watch.log")
        log_f = open(log_path, "a", encoding="utf-8")
        child_env = os.environ.copy()
        child_env["PYTHONIOENCODING"] = "utf-8"
        child_env["PYTHONUNBUFFERED"] = "1"
        child_env["LS_WATCH_INTERVAL"] = str(interval)
        child_env["LS_WATCH_START_HOUR"] = str(start_h)
        child_env["LS_WATCH_END_HOUR"] = str(end_h)
        cmd = [sys.executable, "-u", ls_script] + extra_args
        if extra_args:  # 직접 watch 폴백
            cmd += [
                "--interval",
                str(interval),
                "--start-hour",
                str(start_h),
                "--end-hour",
                str(end_h),
            ]
        proc = subprocess.Popen(
            cmd,
            cwd=backend_dir,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env=child_env,
        )
        with open(lock_path, "w", encoding="utf-8") as f:
            f.write(str(proc.pid))
        print(
            f"[LS] 감시 슈퍼바이저 기동 pid={proc.pid} "
            f"({start_h}:00~{end_h}:00, {interval}분) log={log_path}"
        )
    except Exception as e:
        print(f"[LS] 감시 기동 실패: {e}")


# Django 앱 로드 시 LS 감시 (gunicorn 포함). start_server 와 중복 시 lock 으로 1회만.
try:
    _start_ls_watch_process()
except Exception as _ls_e:
    print(f"[LS] 기동 훅 오류: {_ls_e}")