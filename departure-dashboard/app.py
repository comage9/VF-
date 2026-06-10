#!/usr/bin/env python3
"""VF 출차 관리 대시보드 v2 — Flask 서버"""
import json, os, datetime, sys, subprocess, urllib.request, urllib.parse
from flask import Flask, request, jsonify

# KPP MCP 서버 함수 직접 import (subprocess 우회)
sys.path.insert(0, r'E:\coding\skill\KPP\kpp-mcp-server')
from server import CDPHandle, do_set_plt, do_edi_print

# 절대 경로로 시작
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_PATH = os.path.join(SCRIPT_DIR, "templates", "dashboard.html")

app = Flask(__name__)

# 차량 DB
with open(os.path.join(SCRIPT_DIR, "vehicle_db_merged.json"), "r", encoding="utf-8") as f:
    VEHICLES = json.load(f)

# 데이터 저장소
LS_DATA = []
KPP_DATA = []

# 설정 파일 로드 (config.json)
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")
CONFIG = {}
if os.path.isfile(CONFIG_PATH):
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            CONFIG = json.load(f)
    except Exception:
        pass


# ── 기동 시 ls_data.json 자동 로드 (오늘 날짜만) ──
LS_DATA_PATH = os.path.join(SCRIPT_DIR, "ls_data.json")
TODAY = datetime.date.today().strftime("%Y-%m-%d")
if os.path.isfile(LS_DATA_PATH):
    try:
        with open(LS_DATA_PATH, "r", encoding="utf-8") as f:
            saved = json.load(f)
        if isinstance(saved, list):
            LS_DATA = saved
            # original_ton 초기화 (기존 데이터 호환)
            for v in LS_DATA:
                if "original_ton" not in v or not v.get("original_ton"):
                    v["original_ton"] = v.get("ton", "5T")
    except Exception:
        pass  # 손상된 파일 무시

def is_plate_match(p1, p2):
    p1_clean = p1.replace(" ", "")
    p2_clean = p2.replace(" ", "")
    if not p1_clean or not p2_clean:
        return False
    if p1_clean == p2_clean:
        return True
    
    # 숫자만 추출
    import re
    n1 = re.sub(r'[^0-9]', '', p1_clean)
    n2 = re.sub(r'[^0-9]', '', p2_clean)
    
    # 뒤 4자리 숫자가 같고, 한글 문자 중 하나라도 겹치는 경우
    if len(n1) >= 4 and len(n2) >= 4 and n1[-4:] == n2[-4:]:
        h1 = set(re.sub(r'[0-9a-zA-Z]', '', p1_clean))
        h2 = set(re.sub(r'[0-9a-zA-Z]', '', p2_clean))
        if h1.intersection(h2) or n1 in n2 or n2 in n1:
            return True
            
    # 그냥 포함 관계 (예: "89바1454"가 "경기89바1454"에 포함됨)
    if (len(p1_clean) >= 5 and p1_clean in p2_clean) or (len(p2_clean) >= 5 and p2_clean in p1_clean):
        return True
        
    return False

def enrich_ls_data(data):
    """LS_DATA 각 차량에 VEHICLES DB의 접안 이력(최근 접안일, 총 접안 횟수) 정보를 매칭하여 반환"""
    enriched = []
    for v in data:
        ev = v.copy()
        plate = v.get("plate", "").strip()
        last_seen = "-"
        total_orders = 0
        is_new = True
        
        if plate:
            for db_v in VEHICLES:
                db_plate = db_v.get("plate", "").strip()
                if is_plate_match(db_plate, plate):
                    # 기사 정보(이름, 연락처)가 비어있는 경우 DB에 등록된 기사 정보를 자동으로 채움
                    if not ev.get("driver") or not ev.get("driver").strip():
                        # VEHICLES DB의 ls_driver 또는 name 필드 우선 적용
                        db_driver = db_v.get("ls_driver") or db_v.get("name") or ""
                        # float 형태 등으로 잘못 들어간 '.0' 제거 (예: '1454.0')
                        if db_driver.endswith(".0"):
                            db_driver = ""
                        ev["driver"] = db_driver
                        ev["name"] = db_driver
                        
                    if not ev.get("phone") or not ev.get("phone").strip():
                        ev["phone"] = db_v.get("ls_phone") or db_v.get("phone") or ""
                        
                    history = db_v.get("ls_history", [])
                    if history:
                        last_seen = history[-1].get("lastSeen", "-")
                        total_orders = sum(h.get("totalOrders", 0) for h in history)
                        
                    # 과거 접안 이력(totalOrders)이 1회 이상 있는 경우에만 '기존' 차량으로 판정
                    if total_orders > 0:
                        is_new = False
                    break
                    
        ev["isNew"] = is_new
        ev["lastSeen"] = last_seen
        ev["totalOrders"] = total_orders
        enriched.append(ev)
    return enriched

def render_page():
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        html = f.read()
    
    enriched_ls = enrich_ls_data(LS_DATA)
    html = html.replace("__LS_DATA__", json.dumps(enriched_ls, ensure_ascii=False))
    html = html.replace("__KPP_DATA__", json.dumps(KPP_DATA, ensure_ascii=False))
    html = html.replace("__TODAY__", datetime.date.today().strftime("%Y-%m-%d"))
    return html

@app.route("/")
def index():
    return render_page()

@app.route("/api/vehicles")
def api_vehicles():
    q = request.args.get("q", "").strip()
    if q:
        r = [v for v in VEHICLES if q in v["plate"] or q in v.get("name","") or q in v.get("ls_driver","")]
        return jsonify({"results": r[:20], "total": len(r)})
    return jsonify({"total": len(VEHICLES)})

@app.route("/api/vehicle/<plate>")
def api_vehicle(plate):
    p = plate.replace(" ", "")
    for v in VEHICLES:
        if v["plate"].replace(" ", "") == p:
            return jsonify(v)
    m = [v for v in VEHICLES if p in v["plate"]]
    if m: return jsonify(m[0])
    return jsonify({"error": "not found"}), 404

DELETED_PLACEHOLDERS_PATH = os.path.join(SCRIPT_DIR, "deleted_placeholders.json")

def load_deleted_placeholders():
    if os.path.isfile(DELETED_PLACEHOLDERS_PATH):
        try:
            with open(DELETED_PLACEHOLDERS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {}

def save_deleted_placeholders(data):
    with open(DELETED_PLACEHOLDERS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route("/api/deleted-placeholders", methods=["GET", "POST"])
def api_deleted_placeholders():
    if request.method == "POST":
        raw = request.get_json()
        date_str = raw.get("date")
        deleted = raw.get("deleted", {})
        all_data = load_deleted_placeholders()
        all_data[date_str] = deleted
        save_deleted_placeholders(all_data)
        return jsonify({"ok": True})
    # GET: 현재 날짜의 deleted 목록 반환
    all_data = load_deleted_placeholders()
    date_str = request.args.get("date", datetime.date.today().strftime("%Y-%m-%d"))
    return jsonify({"deleted": all_data.get(date_str, {})})

@app.route("/api/ls-data", methods=["GET", "POST"])
def api_ls_data():
    global LS_DATA
    if request.method == "POST":
        raw = request.get_json()
        if isinstance(raw, dict):
            arr = raw.get("vehicles", raw)
        else:
            arr = raw
        if isinstance(arr, dict):
            arr = [arr]
        LS_DATA = arr
        # original_ton 초기화: 최초 1회만 설정, 이후 변경되지 않음
        for v in LS_DATA:
            if "original_ton" not in v or not v.get("original_ton"):
                v["original_ton"] = v.get("ton", "5T")
        with open(os.path.join(SCRIPT_DIR, "ls_data.json"), "w", encoding="utf-8") as f:
            json.dump(LS_DATA, f, ensure_ascii=False, indent=2)
        return jsonify({"ok": True, "count": len(LS_DATA), "data": enrich_ls_data(LS_DATA)})
    return jsonify({"data": enrich_ls_data(LS_DATA), "updated": datetime.datetime.now().isoformat()})

@app.route("/api/kpp-data", methods=["GET", "POST"])
def api_kpp_data():
    global KPP_DATA
    if request.method == "POST":
        KPP_DATA = request.get_json()
        with open(os.path.join(SCRIPT_DIR, "kpp_data.json"), "w", encoding="utf-8") as f:
            json.dump(KPP_DATA, f, ensure_ascii=False, indent=2)
        return jsonify({"ok": True, "count": len(KPP_DATA)})
    return jsonify({"data": KPP_DATA, "updated": datetime.datetime.now().isoformat()})

@app.route("/api/dispatch-request", methods=["POST"])
def api_dispatch_request():
    """VF67 배차 요청 메시지를 생성하여 Telegram으로 전송"""
    if not LS_DATA:
        return jsonify({"ok": False, "error": "등록된 차량이 없습니다"}), 400

    tg_config = CONFIG.get("telegram", {})
    bot_token = tg_config.get("bot_token")
    chat_id = tg_config.get("chat_id")

    if not bot_token or not chat_id:
        return jsonify({"ok": False, "error": "Telegram 설정(config.json)이 누락되었거나 올바르지 않습니다"}), 500

    # 날짜
    m = datetime.date.today().month
    d = datetime.date.today().day
    date_str = f"{m}/{d}"

    # 메시지 생성
    lines = [f"VF67 - {date_str} 배차 요청 드립니다"]
    for v in LS_DATA:
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

    # Telegram 전송
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
            return jsonify({"ok": True, "message": "배차 요청이 전송되었습니다", "text": text})
        else:
            return jsonify({"ok": False, "error": result.get("description", "전송 실패")}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/debug")
def debug():
    return jsonify({
        "script_dir": SCRIPT_DIR,
        "template_path": TEMPLATE_PATH,
        "template_exists": os.path.exists(TEMPLATE_PATH),
        "template_size": os.path.getsize(TEMPLATE_PATH) if os.path.exists(TEMPLATE_PATH) else 0,
        "ls_data_len": len(LS_DATA),
    })


def _get_registered_ton(hoche):
    """차량 DB(vehicle_db_merged.json)에서 등록 톤수 조회"""
    import re as _re
    plate_map = {1: "864631", 2: "891454", 3: "901703"}
    plate_no = plate_map.get(hoche, "")
    if not plate_no:
        return "5T"
    for v in VEHICLES:
        db_num = _re.sub(r'[^0-9]', '', v.get("plate", ""))
        if plate_no in db_num:
            ton = v.get("ton", "").strip().upper()
            if ton in ("5T", "11T", "14T"):
                return ton
            return "5T"
    return "5T"

def _try_ls_ton_change(hoche, target_ton, results, ls_data, original_ton=None):
    """
    CDP fetch로 실제 LS 차량 톤수 확인 및 변경 (P5 하향 규칙 적용)
    
    하향 규칙:
    - target_rank > actual_rank → 무조건 상향
    - target_rank < actual_rank:
        - target_ton == original_ton → 하향 허용
        - target_ton == registered_ton(vehicle_db) → 하향 허용
        - 그 외 → current 유지 (하향 불가)
    - target_rank == actual_rank → 유지
    """
    import websocket
    # 톤수 등급 정의 (비교용)
    ton_ranks = {"1T": 0, "2.5T": 1, "3.5T": 2, "5T": 3, "11T": 4, "14T": 5}
    target_rank = ton_ranks.get(target_ton, 0)
    if target_rank == 0:
        return True # 잘못된 톤수 목표는 무시

    # 톤수별 세부 스펙 정의 (test_ls_change_v3.py와 동일한 추가 필드 반영)
    # 14T의 실제 LS 규격은 가로채서 확인 후 조정할 수 있도록 로그 출력을 추가함
    ton_specs = {
        "5T": {
            "truckTypeId": 5,
            "code": "T05000",
            "name": "5T",
            "loadCapacity": 5000,
            "length": 6200,
            "width": 2300,
            "height": 2200
        },
        "11T": {
            "truckTypeId": 6,
            "code": "T11000",
            "name": "11T",
            "loadCapacity": 1360,
            "length": 9000,
            "width": 2350,
            "height": 2500
        },
        "14T": {
            "truckTypeId": 7,
            "code": "T14000",
            "name": "14T",
            "loadCapacity": 1400,
            "length": 9600,
            "width": 2350,
            "height": 2500
        }
    }

    try:
        # LS 쿠팡 탭 찾기
        tabs = json.loads(urllib.request.urlopen("http://localhost:9222/json", timeout=5).read())
        tab = next((t for t in tabs if "ls.coupang.com" in t.get("url","")), None)
        if not tab:
            results.append("⚠️ LS 페이지 없음 — Chrome에서 ls.coupang.com 로그인 필요")
            return True  # P3: KPP는 계속 진행
        ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=10)
        mid = [0]
        def cmd(m, p=None):
            if p is None: p = {}
            mid[0] += 1; ws.send(json.dumps({'id': mid[0], 'method': m, 'params': p}))
            ws.settimeout(10)
            while True:
                try:
                    r = json.loads(ws.recv())
                    if 'id' in r and r['id'] == mid[0]: return r
                except websocket.WebSocketTimeoutException:
                    return {"error": "timeout"}
        
        # 1. 오늘 날짜 구하기 및 당일 전체 오더 리스트 조회 (/data/order API)
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        js_get = f"""(async () => {{
            try {{
                const r = await fetch('https://ls.coupang.com/data/order?statuses=&usageTypes=&orderStart={today_str}&orderEnd={today_str}&page=0&pageSize=100&isShuttle=false', {{
                    credentials: 'include'
                }});
                return await r.text();
            }} catch(e) {{
                return JSON.stringify({{ error: e.message }});
            }}
        }})()"""
        
        resp = cmd("Runtime.evaluate", {"expression": js_get, "returnByValue": True, "awaitPromise": True})
        val = resp.get("result",{}).get("result",{}).get("value","{}")
        data = json.loads(val)
        orders = data.get("data", {}).get("content", [])
        
        # 2. LS 차량 조회 (호차 기준 플레이트번호 매칭)
        plate_map = {1: "864631", 2: "891454", 3: "901703"}
        plate_no = plate_map.get(hoche, "")
        if not plate_no:
            results.append(f"⚠️ LS: {hoche}호차 plate mapping 없음")
            ws.close(); return True  # P3: KPP는 계속 진행
            
        target_order = None
        for order in orders:
            truck_info = order.get("truckInfo") or {}
            plate = str(truck_info.get("plateNumber") or "").replace(" ", "")
            if plate_no in plate:
                target_order = order
                break
                
        if not target_order:
            results.append(f"⚠️ LS: {hoche}호차를 오늘 오더 목록에서 찾을 수 없음 (plate={plate_no})")
            ws.close(); return True  # P3: KPP는 계속 진행

        # 3. 실제 쿠팡 서버의 현재 톤수 파악 및 P5 규칙 기반 변경 여부 판단
        actual_ton = target_order.get("truckType", {}).get("name", "5T")
        actual_rank = ton_ranks.get(actual_ton, 3)
        target_rank = ton_ranks.get(target_ton, 0)
        
        if target_rank == 0:
            results.append(f"⚠️ LS: 지원하지 않는 대상 톤수 {target_ton}")
            ws.close(); return True  # 알 수 없는 톤수는 무시, KPP는 계속
        
        # --- P5 하향 규칙 적용 ---
        if actual_ton == target_ton:
            results.append(f"✅ LS 톤수 이미 일치: {actual_ton}")
            ws.close(); return True
        
        if target_rank > actual_rank:
            # 상향: 무조건 허용
            final_ton = target_ton
            results.append(f"🔄 상향 필요: 실제 LS 톤수({actual_ton}) → 목표({target_ton})")
        elif target_rank < actual_rank:
            # 하향: 조건부 허용
            orig = original_ton or next((v.get("original_ton", v.get("ton")) for v in ls_data if v.get("hoche") == hoche), target_ton)
            registered = _get_registered_ton(hoche)
            if target_ton == orig:
                results.append(f"🔄 하향 허용(초기값={orig}과 동일): {actual_ton}→{target_ton}")
                final_ton = target_ton
            elif target_ton == registered:
                results.append(f"🔄 하향 허용(등록톤={registered}과 동일): {actual_ton}→{target_ton}")
                final_ton = target_ton
            else:
                results.append(f"⛔ 하향 불가: {actual_ton}→{target_ton} (초기값={orig}, 등록값={registered}), 현재 유지")
                ws.close(); return True  # LS 유지, KPP는 계속 진행
        else:
            # 동일 랭크 (위에서 actual_ton == target_ton 거름)
            ws.close(); return True
        
        # --- PUT /data/order/{truckRequestId} 로 톤수 변경 ---
        req_id = target_order.get("truckRequestId")
        ton_ids = {"5T": 5, "11T": 6, "14T": 7}
        new_id = ton_ids.get(final_ton, 5)
        code_val = f"T{final_ton.replace('T','')}000"
        
        # truckType만 교체 (다른 필드는 유지)
        if "truckType" not in target_order or target_order["truckType"] is None:
            target_order["truckType"] = {}
        target_order["truckType"]["truckTypeId"] = new_id
        target_order["truckType"]["code"] = code_val
        target_order["truckType"]["name"] = final_ton
        # loadCapacity 등 보조 필드는 유지 (spec에서 가져오거나 기존값 보존)
        spec = ton_specs.get(final_ton)
        if spec:
            for k in ("loadCapacity", "length", "width", "height"):
                target_order["truckType"][k] = spec[k]
        
        print(f"[LS Tonnage Change] Original truckType for Request ID {req_id}: {target_order.get('truckType')}")
        
        # 4. PUT /data/order/{truckRequestId} 호출
        js_put = f"""(async () => {{
            try {{
                const r = await fetch('https://ls.coupang.com/data/order/{req_id}', {{
                    method: 'PUT',
                    credentials: 'include',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({json.dumps(target_order)})
                }});
                return JSON.stringify({{ status: r.status, text: await r.text() }});
            }} catch(e) {{
                return JSON.stringify({{ error: e.message }});
            }}
        }})()"""
        
        resp2 = cmd("Runtime.evaluate", {"expression": js_put, "returnByValue": True, "awaitPromise": True})
        val2 = resp2.get("result",{}).get("result",{}).get("value","{}")
        put_result = json.loads(val2)
        ws.close()
        
        if put_result.get("status") == 200:
            results.append(f"✅ LS 톤수 변경 완료: {actual_ton}→{final_ton}")
            for vv in ls_data:
                if vv.get("hoche") == hoche:
                    vv["ton"] = final_ton; break
            return True
        elif put_result.get("status") == 401:
            results.append(f"❌ LS 인증 만료 (HTTP 401) — Chrome에서 LS 재로그인 필요")
            return True  # P3: KPP는 계속 진행
        else:
            results.append(f"❌ LS 톤수 변경 실패: HTTP {put_result.get('status')} - {put_result.get('text')}")
            return True  # P3: KPP는 계속 진행
    except Exception as e:
        results.append(f"⚠️ LS 톤수 변경 오류: {e}")
        return True  # P3: KPP는 계속 진행


@app.route("/api/print/<int:hoche>")
def api_print(hoche):
    """🖨️ VF 출차관리 통합 출력
    1. 대시보드 톤수 기준 LS 톤수 무조건 검증 및 변경 (P0)
    2. LS PDF 출력 시도
    3. KPP 연동 (PLT 조회, 수정 및 EDI 인쇄) — LS 실패에 독립적 작동 (P3)
    """
    results = []
    dashboard_plt = request.args.get("plt", 0, type=int)

    # VF 대시보드 차량 정보
    vehicle = None
    for v in LS_DATA:
        if v.get("hoche") == hoche:
            vehicle = v
            break
    dash_plate = (vehicle or {}).get("plate", "").strip()
    dash_ton = (vehicle or {}).get("ton", "")

    # ── 1단계: LS 톤수 변경 및 동기화 (KPP와 완전히 독립적 수행 - P0, P3) ──
    # original_ton: 최초 배차 신청 톤수 (없으면 현재 ton)
    original_ton = (vehicle or {}).get("original_ton") or (vehicle or {}).get("ton", "")
    if dash_ton in ["5T", "11T", "14T"]:
        _try_ls_ton_change(hoche, dash_ton, results, LS_DATA, original_ton)

    # ── 2단계: LS PDF 출력 (KPP 연결 실패에도 출력되도록 독립 배치) ──
    ls_pdf = os.path.join(SCRIPT_DIR, "ls_pdfs", f"{hoche}_slip.pdf")
    if os.path.isfile(ls_pdf):
        try:
            os.startfile(ls_pdf, "print")
            results.append(f"🖨️ LS PDF 출력: {hoche}호차 완료")
        except Exception as e:
            results.append(f"⚠️ LS PDF 출력 오류: {e}")
    else:
        results.append(f"⚠️ LS PDF 없음: ls_pdfs/{hoche}_slip.pdf")

    # ── 3단계: KPP 연동 (PLT 조회, 수정 및 EDI 출력) ──
    # 별도의 try-except 블록으로 완전히 격리하여 KPP 동작 실패가 전체 API 흐름이나 LS 처리를 차단하지 않도록 함 (P3)
    try:
        with CDPHandle() as cdp:
            conn = cdp.connect()
            if "찾을 수 없" in conn or not conn:
                results.append(f"❌ KPP 연결 실패: {conn or '연결할 수 없음'}")
            else:
                # KPP 시스템의 alert/confirm 팝업창 무력화
                cdp.js('window.alert = function() { return true; }; window.confirm = function() { return true; };')
                
                import time as _time
                cdp.js('document.getElementById("sr_dlv_dat_f").value = "' + datetime.date.today().strftime('%Y-%m-%d') + '"')
                cdp.js('document.getElementById("sr_dlv_dat_t").value = "' + datetime.date.today().strftime('%Y-%m-%d') + '"')
                cdp.js('document.getElementById("search").click()')
                _time.sleep(2)

                kpp_data = None
                rc = cdp.js('GC.Spread.Sheets.findControl("grid").getActiveSheet().getRowCount()')
                if not rc or rc == 0:
                    results.append("⚠️ KPP 조회 결과 0건")
                else:
                    for r in range(rc):
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

                    # 차량번호 비교 (숫자만 추출)
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
                    # Verify CDP connection is still alive
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
                        except:
                            pass
                        _conn_msg = cdp.connect()
                        if "찾을 수 없" in _conn_msg:
                            results.append(f"❌ KPP 재연결 실패: {_conn_msg} ➡️ KPP EDI 출력을 건너뜁니다")
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

    return jsonify({"ok": True, "hoche": hoche, "results": results})


@app.route("/api/ls-pdf-status")
def api_ls_pdf_status():
    """각 호차의 LS PDF 존재 여부 반환"""
    pdfs = {}
    for i in range(1, 10):
        p = os.path.join(SCRIPT_DIR, "ls_pdfs", f"{i}_slip.pdf")
        pdfs[str(i)] = os.path.isfile(p)
    return jsonify({"pdfs": pdfs})


if __name__ == "__main__":
    port = 5177
    print(f"VF 대시보드 시작: http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
