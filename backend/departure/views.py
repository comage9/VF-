"""VF 출차 관리 대시보드 — Django views (Flask app.py 이식)"""
import json, os, datetime, re, time, urllib.request, urllib.parse
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


def load_ls_data_by_date(date_str):
    """지정 날짜의 ls_data 로드 (없으면 빈 리스트). 일별 파일 우선, 공통 파일 fallback."""
    if not date_str:
        date_str = TODAY
    daily = os.path.join(DATA_DIR, f"ls_data_{date_str}.json")
    if os.path.isfile(daily):
        try:
            with open(daily, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, list):
                return saved
        except Exception:
            pass
    # fallback: 공통 ls_data.json에서 date 필드 필터링
    common = os.path.join(DATA_DIR, "ls_data.json")
    if os.path.isfile(common):
        try:
            with open(common, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, list):
                return [v for v in saved if v.get("date") == date_str]
        except Exception:
            pass
    return []


def save_ls_data_by_date(date_str, data):
    """지정 날짜의 ls_data를 일별 파일에 저장 (다른 날짜 데이터는 보존)."""
    if not date_str:
        date_str = TODAY
    daily = os.path.join(DATA_DIR, f"ls_data_{date_str}.json")
    # 모든 entry에 date 보정
    norm = []
    for v in (data or []):
        ev = dict(v)
        ev["date"] = date_str
        norm.append(ev)
    with open(daily, "w", encoding="utf-8") as f:
        json.dump(norm, f, ensure_ascii=False, indent=2)
    return daily


def _ensure_ls_loaded_for(date_str):
    """요청 날짜의 데이터가 모듈 캐시에 없으면 로드."""
    global LS_DATA
    if not LS_DATA:
        LS_DATA = load_ls_data_by_date(date_str)
        for v in LS_DATA:
            if "original_ton" not in v or not v.get("original_ton"):
                v["original_ton"] = v.get("ton", "5T")


# 기동 시: 오늘 날짜 일별 파일 우선 로드 (없으면 공통 파일)
ls_data_path_today = os.path.join(DATA_DIR, f"ls_data_{TODAY}.json")
ls_data_path = ls_data_path_today
if not os.path.isfile(ls_data_path):
    ls_data_path = os.path.join(DATA_DIR, "ls_data.json")
if os.path.isfile(ls_data_path):
    try:
        with open(ls_data_path, "r", encoding="utf-8") as f:
            saved = json.load(f)
        if isinstance(saved, list):
            LS_DATA = saved
            for v in LS_DATA:
                if "original_ton" not in v or not v.get("original_ton"):
                    v["original_ton"] = v.get("ton", "5T")
    except Exception:
        pass


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


def enrich_ls_data(data):
    today = datetime.date.today().strftime("%Y-%m-%d")
    enriched = []
    for v in data:
        ev = v.copy()
        plate = v.get("plate", "").strip()
        last_seen = "-"
        total_orders = 0
        is_new = True
        
        # Collect ALL matching DB entries
        all_matches = []
        if plate:
            for db_v in VEHICLES:
                db_plate = db_v.get("plateNumber", "").strip()
                if is_plate_match(db_plate, plate):
                    all_matches.append(db_v)
        
        if all_matches:
            # Collect ALL unique dates across all entries (valid + [DELETED] 모두 포함)
            all_dates = set()
            best_v = None  # driver 정보가 있는 entry 우선
            for mv in all_matches:
                for d in mv.get("dates", []):
                    all_dates.add(d)
                if best_v is None or (mv.get("driverName") and mv["driverName"] not in ("[DELETED]", "")):
                    best_v = mv
            if best_v is None:
                best_v = all_matches[0]
            
            # 오늘 제외 접안 계산
            today_str = today
            past_dates = sorted([d for d in all_dates if d < today_str])
            if past_dates:
                last_seen = max(past_dates)
                total_orders = len(past_dates)
                is_new = False
            else:
                last_seen = "-"
                total_orders = 0
                is_new = True

            # Fill missing fields from matched DB entry (best_v = driver 정보 있는 entry 우선)
            if not ev.get("driver") or not ev.get("driver").strip():
                db_driver = best_v.get("driverName", "") or ""
                if db_driver.endswith(".0"):
                    db_driver = ""
                ev["driver"] = db_driver or v.get("driverName", "") or ""
                ev["name"] = ev["driver"]
            if not ev.get("phone") or not ev.get("phone").strip():
                ev["phone"] = (best_v.get("driverPhone", "") or "") or v.get("driverPhone", "") or v.get("phone", "") or ""
        
        ev["isNew"] = is_new
        ev["lastSeen"] = last_seen
        ev["totalOrders"] = total_orders
        # 프론트엔드 date 필터용 — 데이터에 date가 없으면 오늘 날짜로
        if "date" not in ev or not ev.get("date"):
            ev["date"] = datetime.date.today().strftime("%Y-%m-%d")
        enriched.append(ev)
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
            target_date = target_date or raw.get("date") or TODAY
            arr = raw.get("vehicles", raw)
        else:
            arr = raw
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
    if not LS_DATA:
        return JsonResponse({"ok": False, "error": "등록된 차량이 없습니다"}, status=400)

    tg_config = CONFIG.get("telegram", {})
    bot_token = tg_config.get("bot_token")
    chat_id = tg_config.get("chat_id")

    if not bot_token or not chat_id:
        return JsonResponse({"ok": False, "error": "Telegram 설정(config.json) 누락"}, status=500)

    m = datetime.date.today().month
    d = datetime.date.today().day
    date_str = f"{m}/{d}"

    # 오늘 날짜 데이터만 사용 (다른 날짜 캐시가 섞이지 않도록)
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    today_data = [v for v in LS_DATA if v.get("date") == today_str]
    if not today_data:
        return JsonResponse({"ok": False, "error": "등록된 차량이 없습니다"}, status=400)

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
    "KPP EDI + LS PDF 출력 통합 (실제 인쇄 로직)"
    plt = int(request.GET.get("plt", "0"))
    dashboard_plt = plt
    results = []
    ok = True

    # 대시보드 LS_DATA에서 해당 호차 정보 조회
    vehicle = None
    for v in LS_DATA:
        if v.get("hoche") == hoche:
            vehicle = v
            break
    dash_plate = (vehicle or {}).get("plate", "").strip()
    dash_ton = (vehicle or {}).get("ton", "")

    # ── 1단계: LS PDF 출력 ──
    ls_pdf_dir = os.path.join(DATA_DIR, "ls_pdfs", datetime.date.today().strftime("%Y-%m-%d"))
    ls_pdf = os.path.join(ls_pdf_dir, f"{hoche}_slip.pdf")
    # 날짜 없이도 검색
    if not os.path.isfile(ls_pdf):
        ls_pdf = os.path.join(DATA_DIR, "ls_pdfs", f"{hoche}_slip.pdf")

    if os.path.isfile(ls_pdf):
        try:
            import win32api
            win32api.ShellExecute(0, "printto", ls_pdf, '"Canon G2010 series"', ".", 0)
            results.append(f"✅ LS PDF 출력: {hoche}호차 완료 ({os.path.basename(ls_pdf)})")
        except Exception as e:
            results.append(f"⚠️ LS PDF 출력 오류: {e}")
            ok = False
    else:
        results.append(f"⚠️ LS PDF 없음: {ls_pdf}")

    # ── 2단계: KPP 연동 (PLT 조회, 수정 및 EDI 출력) ──
    try:
        with CDPHandle() as cdp:
            conn = cdp.connect()
            if "찾을 수 없" in conn or not conn:
                results.append(f"❌ KPP 연결 실패: {conn or '연결할 수 없음'}")
                ok = False
            else:
                # KPP alert/confirm 무력화
                cdp.js('window.alert = function() { return true; }; window.confirm = function() { return true; };')

                # 오늘 날짜 조회
                today_str = datetime.date.today().strftime('%Y-%m-%d')
                cdp.js(f'document.getElementById("sr_dlv_dat_f").value = "{today_str}"')
                cdp.js(f'document.getElementById("sr_dlv_dat_t").value = "{today_str}"')
                cdp.js('document.getElementById("search").click()')
                time.sleep(2)

                # 그리드에서 호차 행 찾기
                kpp_data = None
                rc = cdp.js('GC.Spread.Sheets.findControl("grid").getActiveSheet().getRowCount()')
                if not rc or rc == 0:
                    results.append("⚠️ KPP 조회 결과 0건")
                else:
                    for r in range(int(rc)):
                        h = cdp.js(f'GC.Spread.Sheets.findControl("grid").getActiveSheet().getValue({r},36)') or ""
                        if str(hoche) in str(h):
                            kpp_plt = cdp.js(f'GC.Spread.Sheets.findControl("grid").getActiveSheet().getValue({r},18)') or 0
                            kpp_plate = cdp.js(f'GC.Spread.Sheets.findControl("grid").getActiveSheet().getValue({r},31)') or ""
                            kpp_data = {"plt": int(kpp_plt), "plate": str(kpp_plate).strip()}
                            break

                if kpp_data is None:
                    results.append(f"⚠️ KPP에서 {hoche}호차를 찾을 수 없음")
                else:
                    kpp_plt = kpp_data["plt"]
                    kpp_plate = kpp_data["plate"]

                    # 차량번호 비교
                    if dash_plate and kpp_plate:
                        import re as _re
                        dash_num_only = _re.sub(r'[^0-9]', '', dash_plate)
                        kpp_num_only = _re.sub(r'[^0-9]', '', kpp_plate)
                        if kpp_num_only in dash_num_only or dash_num_only in kpp_num_only:
                            results.append(f"✅ 차량번호 일치: {dash_plate}")
                        else:
                            results.append(f"⚠️ 차량번호 불일치! KPP: {kpp_plate}, 대시보드: {dash_plate}")

                    # PLT 비교 및 KPP 수정
                    if dashboard_plt == 0:
                        results.append(f"ℹ️ 대시보드 PLT=0 (미입력), KPP 현재 PLT={kpp_plt}")
                    elif kpp_plt == dashboard_plt:
                        results.append(f"✅ 수량 일치: PLT={kpp_plt} — KPP 수정 없이 출력")
                    else:
                        results.append(f"📊 수량 불일치: KPP={kpp_plt}, 대시보드={dashboard_plt} ➡️ KPP 수정 시도...")
                        kpp_result = do_set_plt(cdp, hoche, dashboard_plt)
                        results.append(f"🔄 KPP 수정 결과: {kpp_result}")

                # KPP EDI 출력
                if kpp_data is not None:
                    # CDP 연결 상태 확인
                    _cdp_alive = False
                    try:
                        _v = cdp.js('1+1')
                        _cdp_alive = _v is not None
                    except Exception:
                        _cdp_alive = False
                    if not _cdp_alive:
                        results.append("⚠️ CDP 연결 복구 중...")
                        try:
                            cdp.close()
                        except Exception:
                            pass
                        _conn_msg = cdp.connect()
                        if "찾을 수 없" in _conn_msg:
                            results.append(f"❌ KPP 재연결 실패 ➡️ KPP EDI 출력을 건너뜁니다")
                        else:
                            results.append(f"✅ KPP 재연결 성공")
                            cdp.js('window.alert = function() { return true; }; window.confirm = function() { return true; };')
                            kpp_print = do_edi_print(cdp, hoche)
                            results.append(f"🖨️ KPP EDI: {kpp_print}")
                    else:
                        kpp_print = do_edi_print(cdp, hoche)
                        results.append(f"🖨️ KPP EDI: {kpp_print}")

    except Exception as e:
        results.append(f"❌ KPP 동작 오류: {e}")
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
