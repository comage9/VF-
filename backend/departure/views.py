"""VF 출차 관리 대시보드 — Django views (Flask app.py 이식)"""
import json, os, datetime, re, time, urllib.request, urllib.parse, threading
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


def load_ls_data_by_date(date_str):
    """지정 날짜의 ls_data 로드 (없으면 빈 리스트). DB departure_records 테이블에서 조회."""
    if not date_str:
        date_str = TODAY
    try:
        records = DepartureRecord.objects.filter(date=date_str).order_by('hoche')
        result = []
        for r in records:
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
                "hub": r.hub,
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
                    "hub": v.get("hub", ""),
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


def enrich_ls_data(data):
    today = datetime.date.today().strftime("%Y-%m-%d")
    enriched = []
    for v in data:
        ev = v.copy()
        plate = v.get("plate", "").strip()
        last_seen = "-"
        total_orders = 0
        is_new = True
        
        # Exact plate match first (plateNumber exact match)
        exact_match = None
        if plate:
            for db_v in VEHICLES:
                db_plate = db_v.get("plateNumber", "").strip()
                if db_plate == plate:
                    exact_match = db_v
                    break
        
        # If no exact match, try fuzzy match (last 4 digits + common chars)
        fuzzy_matches = []
        if not exact_match and plate:
            for db_v in VEHICLES:
                db_plate = db_v.get("plateNumber", "").strip()
                if is_plate_match(db_plate, plate):
                    fuzzy_matches.append(db_v)
        
        # Use exact match if available, else best fuzzy match
        matched_v = exact_match
        if not matched_v and fuzzy_matches:
            # Prefer match with driver info
            best_v = None
            for mv in fuzzy_matches:
                if best_v is None or (mv.get("driverName") and mv["driverName"] not in ("[DELETED]", "")):
                    best_v = mv
            matched_v = best_v or fuzzy_matches[0]
        
        if matched_v:
            # Collect dates from matched vehicle
            all_dates = set()
            for d in matched_v.get("dates", []):
                all_dates.add(d)
            
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

            # Fill missing fields ONLY if not already present in LS data
            # Driver name
            if not ev.get("driver") or not ev.get("driver").strip():
                db_driver = matched_v.get("driverName", "") or ""
                if db_driver.endswith(".0"):
                    db_driver = ""
                ev["driver"] = db_driver or v.get("driverName", "") or ""
                ev["name"] = ev["driver"]
            # Phone - only fill if LS data doesn't have it
            if not ev.get("phone") or not ev.get("phone").strip():
                ev["phone"] = (matched_v.get("driverPhone", "") or "") or v.get("driverPhone", "") or v.get("phone", "") or ""
            # Ton - only fill if missing
            if not ev.get("ton") or not ev.get("ton").strip():
                ev["ton"] = matched_v.get("ton", "5T")
        
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
    """LS PDF 출력 통합 (실제 인쇄 로직) - VehicleOrderService 사용"""
    plt = int(request.GET.get("plt", "0"))
    dashboard_plt = plt
    results = []
    ok = True

    # VehicleOrderService 사용
    from .services.vehicle_order import vehicle_order_service

    target_date = request.GET.get("date") or datetime.date.today().strftime("%Y-%m-%d")
    
    # 호차로 차량번호 찾기
    current_order = vehicle_order_service.get_today_order(target_date)
    vehicle = None
    for v in current_order:
        if v.get("hoche") == hoche:
            vehicle = v
            break
    
    if not vehicle or not vehicle.get("plate"):
        return JsonResponse({"ok": False, "hoche": hoche, "results": ["차량 정보 없음"]}, status=404)
    
    dash_plate = vehicle.get("plate", "").strip()
    dash_ton = vehicle.get("ton", "")
    seals = vehicle.get("seals", {"leftWing": "", "rightWing": "", "backDoor": ""})

    # ── 1단계: LS PDF 출력 ──
    # PDF는 차량번호+날짜 기준으로 탐색
    ls_pdf = vehicle_order_service.get_pdf_path(dash_plate, target_date)
    
    # Fallback: 기존 hoche 파일명 규칙 (마이그레이션용)
    if not ls_pdf:
        ls_pdf_dir = os.path.join(DATA_DIR, "ls_pdfs", target_date)
        ls_pdf = os.path.join(ls_pdf_dir, f"{hoche}_slip.pdf")
        if not os.path.isfile(ls_pdf):
            ls_pdf = os.path.join(DATA_DIR, "ls_pdfs", target_date, f"{hoche}_slip.pdf")

    if os.path.isfile(ls_pdf):
        try:
            # 봉인씰 번호가 있으면 PDF에 합성 (GET 파라미터 우선, 없으면 저장된 것 사용)
            seal_left  = request.GET.get("seal_leftWing", "").strip() or seals.get("leftWing", "")
            seal_right = request.GET.get("seal_rightWing", "").strip() or seals.get("rightWing", "")
            seal_back  = request.GET.get("seal_backDoor", "").strip() or seals.get("backDoor", "")
            
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
                results.append(f"🔒 봉인실 합성: L={seal_left or '-'}, R={seal_right or '-'}, B={seal_back or '-'}")
            
            # 봉인씰 저장 (GET 파라미터가 있으면)
            if request.GET.get("seal_leftWing") or request.GET.get("seal_rightWing") or request.GET.get("seal_backDoor"):
                vehicle_order_service.save_seals(dash_plate, target_date, {
                    "leftWing": seal_left,
                    "rightWing": seal_right,
                    "backDoor": seal_back
                })
            
            try:
                import win32print
                import win32ui
                from PIL import Image, ImageWin
                import fitz as _fitz
                
                # 1. 고화질 픽스맵 이미지로 렌더링
                doc = _fitz.open(ls_pdf)
                page = doc[0]
                pix = page.get_pixmap(dpi=300)
                img_data = pix.tobytes("png")
                
                from io import BytesIO
                img = Image.open(BytesIO(img_data))
                doc.close()
                
                # 2. 프린터 DC 생성 및 이미지 다이렉트 드로잉 (레지스트리 뷰어 연동 차단)
                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC("Canon G2010 series")
                
                printable_width = hDC.GetDeviceCaps(110)   # PHYSICALWIDTH
                printable_height = hDC.GetDeviceCaps(111)  # PHYSICALHEIGHT
                
                hDC.StartDoc("LS_PDF_Sealed_Print")
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
                results.append(f"⚠️ 다이렉트 인쇄 시도 실패 ({pe}) ➡️ 기본 ShellExecute 백업 구동")
                import win32api
                win32api.ShellExecute(0, "printto", ls_pdf, '"Canon G2010 series"', ".", 0)
                results.append(f"✅ LS PDF 출력: {hoche}호차({dash_plate}) 완료")
        except Exception as e:
            results.append(f"⚠️ LS PDF 출력 오류: {e}")
            ok = False
    else:
        results.append(f"⚠️ LS PDF 없음: {dash_plate} ({target_date})")
        ok = False

    # KPP 연동을 수행하지 않고 오직 LS PDF 출력 후 즉시 리턴
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