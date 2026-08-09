# -*- coding: utf-8 -*-
"""
KPP WPPS 세션 — 단계별 진행 (로그인 → 출하통보등록 PBM140MW)

기존 스킬 경로:
  - URL: https://wpps.logisall.net/
  - 등록: https://wpps.logisall.net/ps/PBM140MW
  - 제어: Chrome CDP :9222

사용 (함께 보면서 진행):
  python kpp_session.py                  # Chrome 기동 + 로그인 페이지
  python kpp_session.py --step login     # 로그인만 (자격증명 있으면 자동)
  python kpp_session.py --step register  # PBM140MW 출하통보등록으로 이동
  python kpp_session.py --step status    # 현재 탭/로그인 상태
  python kpp_session.py --step all       # login → register 순차

.env:
  KPP_USERNAME / KPP_PASSWORD  (또는 KPP_ID / KPP_PW)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
CDP_PORT = 9222
WPPS_HOME = "https://wpps.logisall.net/"
PBM140_URL = "https://wpps.logisall.net/ps/PBM140MW"
# 납품/반납 요청 등록 (필요 시)
PBM110_URL = "https://wpps.logisall.net/ps/PBM110MW"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]
USER_DATA_DIR = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "vf-kpp-chrome-cdp")


def load_env() -> dict:
    env = {}
    if ENV_PATH.is_file():
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    # process env 우선
    for k in (
        "KPP_USERNAME",
        "KPP_PASSWORD",
        "KPP_ID",
        "KPP_PW",
        "KPP_id",
        "KPP_password",
    ):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def kpp_credentials(env: dict | None = None) -> tuple[str, str]:
    """
    .env 키 호환:
      KPP_USERNAME / KPP_id / KPP_ID
      KPP_PASSWORD / KPP_password / KPP_PW
    """
    e = env if env is not None else load_env()
    # 대소문자 무시 맵
    lower = {str(k).lower(): v for k, v in e.items()}
    user = (
        e.get("KPP_USERNAME")
        or e.get("KPP_ID")
        or e.get("KPP_id")
        or lower.get("kpp_username")
        or lower.get("kpp_id")
        or ""
    )
    pw = (
        e.get("KPP_PASSWORD")
        or e.get("KPP_password")
        or e.get("KPP_PW")
        or lower.get("kpp_password")
        or lower.get("kpp_pw")
        or ""
    )
    return (user or "").strip(), (pw or "").strip()


def cdp_available() -> bool:
    try:
        urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/version", timeout=2)
        return True
    except Exception:
        return False


def find_chrome() -> str | None:
    for p in CHROME_CANDIDATES:
        if p and os.path.isfile(p):
            return p
    return None


def ensure_chrome() -> bool:
    if cdp_available():
        print(f"[KPP] Chrome CDP 이미 실행 중 (:{CDP_PORT})")
        return True
    chrome = find_chrome()
    if not chrome:
        print("[KPP] Chrome 실행 파일을 찾지 못했습니다.")
        return False
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    cmd = [
        chrome,
        f"--remote-debugging-port={CDP_PORT}",
        "--remote-allow-origins=*",
        f"--user-data-dir={USER_DATA_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        WPPS_HOME,
    ]
    print(f"[KPP] Chrome 기동: port={CDP_PORT}")
    print(f"      profile={USER_DATA_DIR}")
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for i in range(20):
        time.sleep(0.5)
        if cdp_available():
            print("[KPP] CDP 연결 준비 완료")
            return True
    print("[KPP] CDP 대기 시간 초과")
    return False


def list_tabs() -> list:
    data = urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json", timeout=5).read()
    return json.loads(data)


def find_tab(url_substr: str = "", title_substr: str = "") -> dict | None:
    for t in list_tabs():
        if t.get("type") != "page":
            continue
        u = t.get("url") or ""
        title = t.get("title") or ""
        if url_substr and url_substr in u:
            return t
        if title_substr and title_substr in title:
            return t
    return None


class CdpPage:
    def __init__(self, tab: dict | None = None):
        import websocket

        if tab is None:
            tabs = [t for t in list_tabs() if t.get("type") == "page"]
            if not tabs:
                raise RuntimeError("열린 탭 없음")
            tab = tabs[0]
        self.tab = tab
        self.ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=15)
        self._id = 0

    def cmd(self, method: str, params: dict | None = None, timeout: float = 20) -> dict:
        self._id += 1
        self.ws.settimeout(timeout)
        self.ws.send(json.dumps({"id": self._id, "method": method, "params": params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self._id:
                return r

    def js(self, expr: str, timeout: float = 20, user_gesture: bool = False):
        params = {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True,
        }
        # WPPS fn_print 등 일부 동작은 userGesture 없으면 조용히 실패/Uncaught
        if user_gesture:
            params["userGesture"] = True
        r = self.cmd(
            "Runtime.evaluate",
            params,
            timeout=timeout,
        )
        res = r.get("result", {}).get("result", {})
        if r.get("result", {}).get("exceptionDetails"):
            print("[JS]", r["result"]["exceptionDetails"].get("text"))
            return None
        return res.get("value")

    def navigate(self, url: str, wait: float = 3.0):
        print(f"[KPP] 이동 → {url}")
        self.cmd("Page.enable")
        self.cmd("Page.navigate", {"url": url})
        time.sleep(wait)

    def url(self) -> str:
        return self.js("location.href") or self.tab.get("url") or ""

    def title(self) -> str:
        return self.js("document.title") or self.tab.get("title") or ""

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def step_status() -> dict:
    if not cdp_available():
        return {"ok": False, "error": "Chrome CDP 없음. python kpp_session.py --step launch 먼저"}
    tabs = list_tabs()
    pages = [
        {"title": t.get("title"), "url": t.get("url")}
        for t in tabs
        if t.get("type") == "page"
    ]
    pbm = find_tab("PBM140MW", "출하통보")
    print("[KPP] 열린 탭:")
    for p in pages:
        mark = " ← PBM140" if pbm and p.get("url") == pbm.get("url") else ""
        print(f"  - {p.get('title')}: {p.get('url')}{mark}")
    return {"ok": True, "tabs": pages, "on_pbm140": bool(pbm)}


def _detect_login_fields(page: CdpPage) -> dict:
    """로그인 폼 셀렉터 탐지 (사이트 구조 변경 대비)."""
    return page.js(
        """
(() => {
  const candidates = {
    user: ['#userId','#userid','#username','#loginId','#user_id','input[name=userId]',
           'input[name=userid]','input[name=username]','input[name=loginId]',
           'input[type=text]'],
    pass: ['#password','#passwd','#userPw','#user_pw','input[name=password]',
           'input[name=passwd]','input[type=password]'],
    btn:  ['#login','#btnLogin','#loginBtn','button[type=submit]',
           'input[type=submit]','.btn-login','a.login','button.btn']
  };
  function first(sels) {
    for (const s of sels) {
      try {
        const el = document.querySelector(s);
        if (el && el.offsetParent !== null) return s;
      } catch(e) {}
    }
    return null;
  }
  // 한글 '로그인' 버튼 텍스트 매칭
  let btnText = null;
  for (const el of document.querySelectorAll('button, a, input[type=button], input[type=submit]')) {
    const t = (el.innerText || el.value || '').trim();
    if (t === '로그인' || t.includes('로그인')) {
      if (!el.id) el.setAttribute('data-vf-login-btn', '1');
      btnText = el.id ? ('#' + el.id) : '[data-vf-login-btn="1"]';
      break;
    }
  }
  return {
    user: first(candidates.user),
    pass: first(candidates.pass),
    btn: first(candidates.btn) || btnText,
    hasPassword: !!document.querySelector('input[type=password]'),
    url: location.href,
    title: document.title,
    bodyHint: (document.body && document.body.innerText || '').slice(0, 200)
  };
})()
"""
    ) or {}


def step_launch() -> dict:
    ok = ensure_chrome()
    if not ok:
        return {"ok": False, "error": "Chrome 기동 실패"}
    # 홈으로 한 번 더
    try:
        page = CdpPage()
        page.navigate(WPPS_HOME, wait=2.5)
        info = _detect_login_fields(page)
        print(f"[KPP] 현재: {info.get('title')} | {info.get('url')}")
        print(f"[KPP] 로그인 필드: user={info.get('user')} pass={info.get('pass')}")
        page.close()
        return {"ok": True, "fields": info}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def step_login(wait_manual_sec: int = 120) -> dict:
    """
    자격증명 있으면 자동 입력, 없으면 수동 로그인 대기.
    """
    if not ensure_chrome():
        return {"ok": False, "error": "Chrome 없음"}

    env = load_env()
    user, pw = kpp_credentials(env)

    page = CdpPage()
    page.navigate(WPPS_HOME, wait=2.5)
    fields = _detect_login_fields(page)
    print(f"[KPP] 페이지: {fields.get('title')} / {fields.get('url')}")

    # 이미 로그인된 경우 (패스워드 필드 없음 + 메뉴 존재)
    if not fields.get("hasPassword") and "PBM" not in (fields.get("url") or ""):
        # 로그인 폼이 없을 수 있음
        body = fields.get("bodyHint") or ""
        if "로그인" not in body[:50] and fields.get("pass") is None:
            print("[KPP] 로그인 폼이 보이지 않음 — 이미 로그인된 상태일 수 있습니다.")
            page.close()
            return {"ok": True, "mode": "already_logged_in", "fields": fields}

    if user and pw:
        print(f"[KPP] 자동 로그인 시도 (user={user[:3]}***)")
        # WPPS 로그인 탭 + loginType + fn_login() (실제 폼: /login.do)
        result = page.js(
            f"""
(() => {{
  // 1) WPPS 로그인 모드
  const wppsBtn = document.querySelector('button.WPPS-login');
  if (wppsBtn) wppsBtn.click();
  const loginType = document.getElementById('loginType');
  if (loginType) {{
    // 사이트 스크립트가 채우지 않으면 WPPS 로 강제
    if (!loginType.value) loginType.value = 'WPPS';
  }}
  const u = document.getElementById('loginId') || document.querySelector({json.dumps(fields.get('user') or '#loginId')});
  const p = document.getElementById('password') || document.querySelector({json.dumps(fields.get('pass') or '#password')});
  if (!u || !p) return {{ok:false, err:'no fields'}};
  const id = {json.dumps(user)};
  const pw = {json.dumps(pw)};
  u.focus();
  u.value = id;
  u.dispatchEvent(new Event('input', {{bubbles:true}}));
  u.dispatchEvent(new Event('change', {{bubbles:true}}));
  // Upper() 핸들러 대응
  if (typeof Upper === 'function') {{
    try {{ Upper({{keyCode:0}}, u); }} catch(e) {{}}
  }}
  p.focus();
  p.value = pw;
  p.dispatchEvent(new Event('input', {{bubbles:true}}));
  p.dispatchEvent(new Event('change', {{bubbles:true}}));
  // 2) 공식 로그인 함수
  if (typeof fn_login === 'function') {{
    fn_login();
    return {{ok:true, via:'fn_login', loginType: loginType ? loginType.value : null}};
  }}
  const btn = document.querySelector('button.btn_login');
  if (btn) {{ btn.click(); return {{ok:true, via:'btn_login'}}; }}
  const form = document.getElementById('loginForm');
  if (form) {{ form.submit(); return {{ok:true, via:'form'}}; }}
  return {{ok:false, err:'no submit'}};
}})()
"""
        )
        print(f"[KPP] 로그인 호출: {result}")
        # 리다이렉트 대기
        for i in range(15):
            time.sleep(1)
            url = page.js("location.href") or ""
            print(f"[KPP] 대기 {i+1}s URL={url}")
            if url and "/login" not in url:
                break
            # 에러 메시지
            msg = page.js(
                "document.querySelector('.login-messagebox')?.innerText || ''"
            )
            if msg and str(msg).strip():
                print(f"[KPP] 메시지: {msg}")
        after_url = page.js("location.href") or ""
        after = _detect_login_fields(page)
        print(f"[KPP] 로그인 후 URL: {after_url}")
        success = after_url and "/login" not in after_url
        page.close()
        return {
            "ok": bool(success),
            "mode": "auto",
            "url": after_url,
            "after": after,
            "error": None if success else "로그인 후에도 /login 에 머무름 (ID/PW 또는 loginType 확인)",
        }

    print("=" * 60)
    print("[KPP] .env 에 KPP_USERNAME / KPP_PASSWORD 가 없거나 폼을 못 찾았습니다.")
    print("      브라우저 창에서 직접 로그인해 주세요.")
    print(f"      최대 {wait_manual_sec}초 대기합니다...")
    print("=" * 60)
    deadline = time.time() + wait_manual_sec
    while time.time() < deadline:
        time.sleep(2)
        try:
            # 탭 새로고침 연결
            page.close()
            page = CdpPage()
            f2 = _detect_login_fields(page)
            url = f2.get("url") or ""
            has_pw = f2.get("hasPassword")
            # 로그인 성공 휴리스틱: password 필드 사라지고 홈/메뉴
            if not has_pw and "login" not in url.lower() and "Login" not in (f2.get("title") or ""):
                print(f"[KPP] 수동 로그인 감지 성공: {url}")
                page.close()
                return {"ok": True, "mode": "manual", "url": url}
            # 이미 PBM 이면 성공
            if "PBM" in url:
                print(f"[KPP] 이미 업무 화면: {url}")
                page.close()
                return {"ok": True, "mode": "manual", "url": url}
        except Exception as e:
            print(f"[KPP] 대기 중: {e}")
    page.close()
    return {"ok": False, "error": "수동 로그인 시간 초과 — 브라우저에서 로그인 후 --step register 실행"}


def step_register() -> dict:
    """출하통보등록(PBM140MW) 페이지로 이동."""
    if not ensure_chrome():
        return {"ok": False, "error": "Chrome 없음"}
    # 기존 PBM 탭 우선
    tab = find_tab("PBM140MW", "출하통보")
    page = CdpPage(tab)
    page.navigate(PBM140_URL, wait=4)
    url = page.url()
    title = page.title()
    print(f"[KPP] 등록 페이지: {title}")
    print(f"      URL: {url}")

    # 간단 요소 확인
    probe = page.js(
        """
(() => {
  const ids = ['search','sr_dlv_dat_f','sr_dlv_dat_t','ediRegister','grid'];
  const found = {};
  ids.forEach(id => { found[id] = !!document.getElementById(id); });
  found.hasSpread = typeof GC !== 'undefined' && !!(GC.Spread && GC.Spread.Sheets);
  found.title = document.title;
  found.url = location.href;
  return found;
})()
"""
    )
    print(f"[KPP] 화면 요소: {probe}")
    page.close()
    ok = bool(probe and ("PBM140" in (probe.get("url") or "") or probe.get("search")))
    return {"ok": ok, "url": url, "title": title, "probe": probe}


def _plate_digits(plate: str) -> str:
    """WPPS 차량번호 칸: 숫자만 (예: 경기89바6845 → 896845)."""
    import re

    return re.sub(r"[^0-9]", "", plate or "")


def _phone_digits(phone: str) -> str:
    import re

    return re.sub(r"[^0-9]", "", phone or "")


def _mute_dialogs(page: CdpPage):
    """alert/confirm 차단 + 메시지 수집. gfn_alert/gfn_confirm 도 동일 처리."""
    page.js(
        """
(() => {
  window.__kpp_alerts = window.__kpp_alerts || [];
  const push = (t, m) => {
    try { window.__kpp_alerts.push(String(t) + ':' + String(m || '')); } catch (e) {}
  };
  window.alert = function(m){ push('alert', m); return true; };
  window.confirm = function(m){ push('confirm', m); return true; };
  window.prompt = function(m){ push('prompt', m); return null; };
  try {
    if (typeof gfn_alert === 'function') {
      window.gfn_alert = function(m){ push('gfn_alert', m); return true; };
    }
  } catch (e) {}
  try {
    if (typeof gfn_confirm === 'function') {
      window.gfn_confirm = function(m){ push('gfn_confirm', m); return true; };
    }
  } catch (e) {}
  return true;
})()
"""
    )


def _close_wpps_notices(page: CdpPage) -> list:
    """Edge 인쇄 안내 등 WPPS 공지 팝업 닫기 (인쇄 가로채기 방지)."""
    return (
        page.js(
            """
(() => {
  const closed = [];
  // 공지 배너
  const notice = document.getElementById('DivPBM140Notice') || document.getElementById('custom-dialog-1');
  if (notice) {
    try { notice.style.display = 'none'; closed.push('notice-hide'); } catch (e) {}
  }
  for (const b of document.querySelectorAll('button, a, span, [class*=close]')) {
    const t = (b.innerText || b.textContent || b.getAttribute('title') || '').trim();
    if (/^✖$|^×$|\\[Close\\]|일주일동안|닫기/i.test(t)) {
      try { b.click(); closed.push(t.slice(0, 30)); } catch (e) {}
    }
  }
  return closed;
})()
"""
        )
        or []
    )


def _pop_alerts(page: CdpPage) -> list[str]:
    al = page.js("const a = window.__kpp_alerts || []; window.__kpp_alerts = []; return a;")
    return list(al or [])


def _ensure_pbm140_page() -> CdpPage:
    if not ensure_chrome():
        raise RuntimeError("Chrome CDP 없음")
    tab = find_tab("PBM140MW", "출하통보")
    page = CdpPage(tab)
    url = page.url() or ""
    if "PBM140MW" not in url:
        page.navigate(PBM140_URL, wait=2.0)
    _mute_dialogs(page)
    return page


def _grid_row_count(page: CdpPage) -> int:
    rc = page.js(
        """
(() => {
  try {
    return GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet().getRowCount();
  } catch(e) { return -1; }
})()
"""
    )
    try:
        return int(rc)
    except Exception:
        return -1


def _wait_grid(page: CdpPage, timeout: float = 3.0, min_rows: int = 0) -> int:
    """
    그리드 준비 폴링.
    min_rows=0 이어도 조회 직후 즉시 리턴하지 않도록 settle 대기 포함.
    """
    # 조회 AJAX 가 돌기 전 0행으로 조기 반환되는 문제 방지
    time.sleep(0.6)
    deadline = time.time() + max(0.5, timeout)
    last = -1
    stable = 0
    while time.time() < deadline:
        last = _grid_row_count(page)
        if last >= min_rows and last >= 0:
            stable += 1
            # 연속 2회 같은 조건이면 조회 완료로 간주
            if stable >= 2:
                return last
        else:
            stable = 0
        time.sleep(0.2)
    return last if last >= 0 else 0


def _search_today(page: CdpPage, date_str: str, wait: float = 2.0) -> int:
    """오늘 날짜로 조회 후 행 수 반환 (폴링)."""
    page.js(
        f"""
(() => {{
  const f = document.getElementById("sr_dlv_dat_f");
  const t = document.getElementById("sr_dlv_dat_t");
  if (f) f.value = "{date_str}";
  if (t) t.value = "{date_str}";
  const el = document.getElementById("sr_dlv_cst_cod");
  if (el) el.value = "217273";
  if (typeof fn_search === 'function') fn_search('BUTTON');
  else {{
    const b = document.getElementById('search');
    if (b) b.click();
  }}
}})()
"""
    )
    return _wait_grid(page, timeout=wait, min_rows=0)


def _list_grid_rows(page: CdpPage) -> list[dict]:
    """PBM140 그리드 행 스냅샷 (빈 행 제외).

    호차: col36(비고) 우선, 없으면 col0(행번호/호차) 폴백.
    최근 WPPS 그리드는 col36 이 비고 비어 있고 col0 에 1,2,3… 인 경우가 많음.
    """
    rows = page.js(
        """
(() => {
  try {
    const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
    const out = [];
    for (let i = 0; i < s.getRowCount(); i++) {
      const hRaw36 = String(s.getValue(i, 36) || '').trim();
      const hRaw0 = String(s.getValue(i, 0) || '').trim();
      // col36 "1호차" 또는 col0 숫자 "1"
      let hRaw = hRaw36;
      let hNum = hRaw36.replace(/호차/g, '').trim();
      if (!hNum && hRaw0 && /^\\d+$/.test(hRaw0)) {
        hNum = hRaw0;
        hRaw = hRaw0 + '호차';
      }
      const car = String(s.getValue(i, 31) || '').replace(/[^0-9]/g, '');
      const driver = String(s.getValue(i, 32) || '');
      const qty = s.getValue(i, 18);
      const mod = s.getValue(i, 2);
      const edi = String(s.getValue(i, 26) || '').trim();
      // 차량/비고 비어도 수량·EDI 있으면 행으로 인식 (출력 대상)
      if (!car && !hRaw && !edi && (qty === null || qty === undefined || qty === '')) continue;
      out.push({
        row: i,
        hoche: hNum,
        hoche_label: hRaw,
        car: car,
        driver: driver,
        qty: qty,
        mod: mod,
        edi: edi
      });
    }
    return out;
  } catch (e) {
    return {error: String(e)};
  }
})()
"""
    )
    if not rows or isinstance(rows, dict):
        return []
    return list(rows)


def _plate_match(a: str, b: str) -> bool:
    """차량번호 숫자 매칭 (끝자리 호환)."""
    if not a or not b:
        return False
    return a == b or a.endswith(b) or b.endswith(a)


def _find_row(page: CdpPage, hoche: int, plate_digits: str) -> int | None:
    """호차 우선, 없으면 차량번호로 행 인덱스. 호차는 정확 매칭."""
    info = find_existing_registration(page, hoche, plate_digits)
    return info.get("target_row")


def find_existing_registration(
    page: CdpPage,
    hoche: int,
    plate_digits: str,
) -> dict:
    """
    그리드에서 기존 등록 여부 판별 (중복 등록 방지용).

    우선순위:
      1) 동일 호차 행
      2) 동일 차량번호 행
    둘 다 있으면 호차 행을 갱신 대상으로 사용.
    """
    rows = _list_grid_rows(page)
    want_h = str(int(hoche))
    want_p = (plate_digits or "").strip()

    by_hoche = []
    by_plate = []
    for r in rows:
        h = str(r.get("hoche") or "").strip()
        label = str(r.get("hoche_label") or "").strip()
        if h == want_h or label == f"{want_h}호차" or label == want_h:
            by_hoche.append(r)
        car = str(r.get("car") or "")
        if want_p and _plate_match(car, want_p):
            by_plate.append(r)

    registered = bool(by_hoche or by_plate)
    # 갱신 대상: 호차 우선
    target = by_hoche[0] if by_hoche else (by_plate[0] if by_plate else None)
    action = "update" if registered else "create"

    conflict = False
    conflict_msg = None
    if by_hoche and by_plate:
        h_rows = {r["row"] for r in by_hoche}
        p_rows = {r["row"] for r in by_plate}
        if h_rows != p_rows and not h_rows.intersection(p_rows):
            # 호차 행과 차량번호 행이 서로 다른 행 → 중복 위험, 호차 행만 갱신
            conflict = True
            conflict_msg = (
                f"호차 행(row={by_hoche[0]['row']})과 차량번호 행(row={by_plate[0]['row']})이 분리됨 "
                f"→ 호차 행만 갱신 (신규 추가 안 함)"
            )

    return {
        "registered": registered,
        "action": action,
        "target_row": int(target["row"]) if target else None,
        "match_by": (
            "hoche"
            if by_hoche
            else ("plate" if by_plate else None)
        ),
        "matches_hoche": by_hoche,
        "matches_plate": by_plate,
        "duplicate_hoche": len(by_hoche) > 1,
        "duplicate_plate": len(by_plate) > 1,
        "conflict": conflict,
        "conflict_msg": conflict_msg,
        "rows": rows,
        "row_count": len(rows),
    }


def check_vehicle_registered(
    *,
    hoche: int,
    plate: str = "",
    date_str: str | None = None,
    page: CdpPage | None = None,
) -> dict:
    """
    오늘자 PBM140 조회 후 해당 호차/차량 등록 여부 확인.
    그리드를 수정하지 않음 (읽기 전용).
    """
    from datetime import date as dt_date

    t0 = time.time()
    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")
    car = _plate_digits(plate)

    own_page = page is None
    if own_page:
        page = _ensure_pbm140_page()
    try:
        rc = _search_today(page, date_str, wait=2.5)
        info = find_existing_registration(page, int(hoche), car)
        info.update(
            {
                "ok": True,
                "hoche": int(hoche),
                "plate": plate,
                "car": car,
                "date": date_str,
                "search_rows": rc,
                "elapsed_s": round(time.time() - t0, 2),
            }
        )
        if info["registered"]:
            tgt = info.get("matches_hoche") or info.get("matches_plate") or []
            sample = tgt[0] if tgt else {}
            info["message"] = (
                f"이미 등록됨 → {info['action']} "
                f"(match={info['match_by']} row={info['target_row']} "
                f"car={sample.get('car')} qty={sample.get('qty')})"
            )
        else:
            info["message"] = f"{hoche}호차 미등록 → 신규 등록 가능"
        print(f"[KPP] 등록확인: {info['message']}")
        return info
    finally:
        if own_page and page:
            page.close()


def delete_hoches(
    hoches: list[int],
    date_str: str | None = None,
    page: CdpPage | None = None,
) -> dict:
    """
    PBM140 그리드에서 지정 호차 행 체크 후 삭제·저장.

    ⚠️ 운영 UI(📦 KPP) 경로에서는 절대 호출하지 않음.
    CLI/수동 테스트 전용. 1호차 포함 삭제 금지 정책은 호출 측에서 지킬 것.
    """
    from datetime import date as dt_date

    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")
    own_page = page is None
    if own_page:
        page = _ensure_pbm140_page()
    try:
        _mute_dialogs(page)
        rc = _search_today(page, date_str, wait=2.0)
        print(f"[KPP] 삭제 전 조회 rows={rc} targets={hoches}")
        want = [str(h) for h in hoches]
        result = page.js(
            f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const rc = s.getRowCount();
  const want = {json.dumps(want)};
  const deleted = [];
  for (let i = 0; i < rc; i++) s.setValue(i, 1, false);
  for (let i = 0; i < rc; i++) {{
    const h = String(s.getValue(i, 36) || '');
    for (const w of want) {{
      if (h.includes(w) || h === w + '호차') {{
        s.setValue(i, 1, true);
        deleted.push({{row:i, hoche:h, car:String(s.getValue(i,31)||'')}});
        break;
      }}
    }}
  }}
  return deleted;
}})()
"""
        )
        if not result:
            return {"ok": True, "deleted": [], "message": "삭제 대상 없음"}
        page.js(
            """
(() => {
  if (typeof fn_delete === 'function') { fn_delete(); return 'fn_delete'; }
  const b = document.getElementById('delete') || document.querySelector('[onclick*="fn_delete"]');
  if (b) { b.click(); return 'click'; }
  return 'no-delete';
})()
"""
        )
        time.sleep(0.4)
        page.js("typeof fn_save==='function' && fn_save()")
        time.sleep(1.0)
        rc2 = _search_today(page, date_str, wait=2.0)
        print(f"[KPP] 삭제 후 rows={rc2} deleted={result}")
        return {"ok": True, "deleted": result, "rows_after": rc2}
    finally:
        if own_page and page:
            page.close()


def _inject_row_data(
    page: CdpPage,
    row: int,
    *,
    car: str,
    driver: str,
    tel: str,
    plt: int,
    hoche_label: str,
) -> dict | None:
    """SpreadJS 행에 출하통보 필드 주입 (스킬 set_row_data 와 동일 컬럼)."""
    return page.js(
        f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  let r = {int(row)};
  const rc = s.getRowCount();
  if (r < 0 || r >= rc) {{
    return {{error: 'row_out_of_range', r: r, rc: rc}};
  }}
  try {{ if (typeof s.endEdit === 'function') s.endEdit(true); }} catch (e) {{}}
  s.setValue(r, 1, true);
  s.setValue(r, 10, '610060');
  s.setValue(r, 12, '9999999999999');
  s.setValue(r, 14, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 15, 'N11');
  s.setValue(r, 18, {int(plt)});
  s.setValue(r, 20, '610060');
  s.setValue(r, 22, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 31, {json.dumps(car)});
  s.setValue(r, 32, {json.dumps(driver or '')});
  s.setValue(r, 33, {json.dumps(tel)});
  s.setValue(r, 36, {json.dumps(hoche_label)});
  s.setActiveCell(r, 18);
  s.setSelection(r, 0, 1, 66);
  return {{
    r: r, rc: s.getRowCount(),
    car: s.getValue(r, 31), driver: s.getValue(r, 32),
    qty: s.getValue(r, 18), hoche: s.getValue(r, 36)
  }};
}})()
"""
    )


def _add_new_row(page: CdpPage) -> int | None:
    """
    스킬 경로: fn_newRow() 만 사용 (addRows 는 저장 시 유실되기 쉬움).
    성공 시 신규 행 인덱스, 실패 시 None.
    """
    rc_before = max(0, _grid_row_count(page))
    via = page.js(
        """
(() => {
  try {
    const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
    const before = s.getRowCount();
    if (typeof fn_newRow !== 'function') {
      return {ok: false, reason: 'no_fn_newRow', before: before, after: before};
    }
    fn_newRow();
    return {ok: true, before: before, after: s.getRowCount(), via: 'fn_newRow'};
  } catch (e) {
    return {ok: false, reason: String(e)};
  }
})()
"""
    )
    time.sleep(1.2)
    rc_after = _grid_row_count(page)
    print(f"[KPP] 신규행 via={via} before={rc_before} after={rc_after}")
    if rc_after > rc_before:
        return rc_after - 1
    # 한 번 더 시도 (UI 지연)
    page.js("typeof fn_newRow==='function' && fn_newRow()")
    time.sleep(1.5)
    rc_after = _grid_row_count(page)
    if rc_after > rc_before:
        print(f"[KPP] 신규행 재시도 성공 after={rc_after}")
        return rc_after - 1
    print(f"[KPP] 신규행 실패 (fn_newRow 미반영) before={rc_before} after={rc_after}")
    return None


def _read_row_verify(page: CdpPage, row: int) -> dict | None:
    return page.js(
        f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const r = {int(row)};
  if (r < 0 || r >= s.getRowCount()) return null;
  return {{
    car: s.getValue(r, 31), driver: s.getValue(r, 32),
    qty: s.getValue(r, 18), hoche: s.getValue(r, 36), mod: s.getValue(r, 2)
  }};
}})()
"""
    )


def _save_grid(page: CdpPage, wait: float = 3.5) -> None:
    """fn_save + 서버 반영 대기 (스킬: 4초 수준)."""
    _mute_dialogs(page)
    page.js(
        """
(() => {
  if (typeof fn_save === 'function') { fn_save(); return 'fn_save'; }
  const b = document.getElementById('save') || document.querySelector('[onclick*="fn_save"]');
  if (b) { b.click(); return 'click'; }
  return 'no-save';
})()
"""
    )
    time.sleep(wait)


def register_vehicle(
    *,
    hoche: int,
    plate: str,
    driver: str,
    phone: str,
    plt: int,
    date_str: str | None = None,
    page: CdpPage | None = None,
    skip_research_after: bool = False,
) -> dict:
    """
    Departure 차량 → PBM140MW 등록/수량 반영.

    1) 조회 후 기존 등록 확인 (호차 → 차량번호)
    2) 이미 있으면 그 행만 갱신 (신규 행 추가 금지 → 중복 방지)
    3) 없을 때만 fn_newRow 후 저장
    """
    from datetime import date as dt_date

    t0 = time.time()
    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")
    car = _plate_digits(plate)
    tel = _phone_digits(phone)
    hoche_label = f"{hoche}호차"
    plt = int(plt or 0)
    # 파렛트 기본 12 강제 제거 — 0/미입력 시 등록 거부
    if plt <= 0:
        return {
            "ok": False,
            "error": "plt_required",
            "message": "파렛트 수량이 없습니다. 화면에서 수량을 입력한 뒤 등록하세요.",
            "plt": plt,
        }

    print(
        f"[KPP] 등록 시작 hoche={hoche} plate={plate} car={car} "
        f"driver={driver} plt={plt} date={date_str}"
    )

    own_page = page is None
    if own_page:
        page = _ensure_pbm140_page()
    try:
        rc = _search_today(page, date_str, wait=2.5)
        print(f"[KPP] 조회 행수={rc} ({time.time()-t0:.1f}s)")

        # ── 기존 등록 여부 확인 (중복 방지 핵심) ──
        existing = find_existing_registration(page, int(hoche), car)
        print(
            f"[KPP] 등록확인 registered={existing['registered']} "
            f"action={existing['action']} match={existing['match_by']} "
            f"row={existing['target_row']} "
            f"dupH={existing['duplicate_hoche']} dupP={existing['duplicate_plate']}"
        )
        if existing.get("conflict_msg"):
            print(f"[KPP] ⚠ {existing['conflict_msg']}")

        is_new = not existing["registered"]
        row = existing.get("target_row")

        if is_new:
            # 미등록 → 신규 1행만 추가
            row = _add_new_row(page)
            if row is None:
                return {
                    "ok": False,
                    "hoche": hoche,
                    "error": "신규 행 추가 실패 (fn_newRow). PBM140 화면·권한 확인",
                    "existing": existing,
                    "elapsed_s": round(time.time() - t0, 2),
                }
            # 추가 직후 재확인: 경합으로 이미 생겼으면 그 행 사용
            recheck = find_existing_registration(page, int(hoche), car)
            if recheck["registered"] and recheck.get("target_row") is not None:
                # 신규 행이 비어 있고 기존 매칭이 다른 행이면 기존 행 사용
                if recheck["target_row"] != row:
                    print(
                        f"[KPP] 신규 직후 기존 매칭 발견 → row={recheck['target_row']} 사용 "
                        f"(빈 신규행 미사용)"
                    )
                    row = recheck["target_row"]
                    is_new = False
            print(f"[KPP] {'신규' if is_new else '기존'} 행 row={row}")
        else:
            print(
                f"[KPP] 기존 등록 확인 → 갱신 only row={row} "
                f"(match={existing['match_by']}, 신규 추가 안 함)"
            )

        if row is None:
            return {
                "ok": False,
                "hoche": hoche,
                "error": "대상 행을 결정하지 못함",
                "existing": existing,
                "elapsed_s": round(time.time() - t0, 2),
            }

        vals = _inject_row_data(
            page,
            int(row),
            car=car,
            driver=driver or "",
            tel=tel,
            plt=plt,
            hoche_label=hoche_label,
        )
        print(f"[KPP] 주입 결과: {vals}")
        if not vals or vals.get("error") or not vals.get("car"):
            return {
                "ok": False,
                "hoche": hoche,
                "error": "그리드 주입 실패",
                "inject": vals,
                "existing": existing,
                "elapsed_s": round(time.time() - t0, 2),
            }

        _save_grid(page, wait=3.5)

        verify = None
        rc3 = 0
        post_check = None
        if not skip_research_after:
            rc3 = _search_today(page, date_str, wait=3.0)
            post_check = find_existing_registration(page, int(hoche), car)
            row2 = post_check.get("target_row")
            if row2 is not None:
                verify = _read_row_verify(page, int(row2))

            # 저장 유실 시 1회 재시도 — 재시도 전에도 기존 여부 재확인
            if verify is None or not verify.get("car"):
                print("[KPP] 저장 미반영 → 1회 재시도 (기존 확인 후)")
                again = find_existing_registration(page, int(hoche), car)
                if again["registered"] and again.get("target_row") is not None:
                    row = again["target_row"]
                    is_new = False
                else:
                    row = _add_new_row(page)
                    is_new = True
                if row is not None:
                    vals = _inject_row_data(
                        page,
                        int(row),
                        car=car,
                        driver=driver or "",
                        tel=tel,
                        plt=plt,
                        hoche_label=hoche_label,
                    )
                    print(f"[KPP] 재주입: {vals}")
                    _save_grid(page, wait=4.0)
                    rc3 = _search_today(page, date_str, wait=3.0)
                    post_check = find_existing_registration(page, int(hoche), car)
                    row2 = post_check.get("target_row")
                    if row2 is not None:
                        verify = _read_row_verify(page, int(row2))

            # 저장 후 중복 경고 (자동 삭제 없음)
            if post_check:
                if post_check.get("duplicate_hoche"):
                    print(
                        f"[KPP] ⚠ 동일 호차 중복 행: {post_check.get('matches_hoche')}"
                    )
                if post_check.get("duplicate_plate"):
                    print(
                        f"[KPP] ⚠ 동일 차량번호 중복 행: {post_check.get('matches_plate')}"
                    )
            print(f"[KPP] 저장 후 검증: rows={rc3} verify={verify} ({time.time()-t0:.1f}s)")
        else:
            verify = vals
            print(f"[KPP] 저장 완료 (재조회 생략) ({time.time()-t0:.1f}s)")

        ok = bool(verify and verify.get("car"))
        if ok and is_new:
            msg = f"{hoche}호차 신규 등록 PLT={plt}"
        elif ok:
            msg = f"{hoche}호차 기존 등록 확인 → 갱신 PLT={plt} (중복 추가 없음)"
        else:
            msg = f"{hoche}호차 저장 미확인 (재조회 행 없음)"

        return {
            "ok": ok,
            "hoche": hoche,
            "plate": plate,
            "car": car,
            "plt": plt,
            "verify": verify,
            "is_new": is_new,
            "existing": {
                "registered": existing["registered"],
                "action": existing["action"],
                "match_by": existing["match_by"],
                "target_row": existing["target_row"],
                "duplicate_hoche": existing["duplicate_hoche"],
                "duplicate_plate": existing["duplicate_plate"],
                "conflict": existing.get("conflict"),
            },
            "post_check": (
                {
                    "duplicate_hoche": post_check.get("duplicate_hoche"),
                    "duplicate_plate": post_check.get("duplicate_plate"),
                    "matches_hoche": post_check.get("matches_hoche"),
                    "matches_plate": post_check.get("matches_plate"),
                }
                if post_check
                else None
            ),
            "elapsed_s": round(time.time() - t0, 2),
            "message": msg,
            "error": None if ok else "저장 후 재조회에서 행을 찾지 못함",
        }
    finally:
        if own_page and page:
            page.close()


def _close_tabs_matching(substrs: list[str]) -> int:
    """
    Chrome PDF 뷰어 등 방해 탭 닫기 (CDP).

    iframe/worker 타깃을 json/close 하면 Chrome CDP 가 죽는 경우가 있어
    type=page 만 닫는다.
    """
    closed = 0
    try:
        tabs = list_tabs()
        for t in tabs:
            if (t.get("type") or "page") != "page":
                continue
            u = (t.get("url") or "") + " " + (t.get("title") or "")
            if not any(s in u for s in substrs):
                continue
            if "PBM140MW" in (t.get("url") or ""):
                continue
            tid = t.get("id")
            if not tid:
                continue
            try:
                req = urllib.request.Request(
                    f"http://localhost:{CDP_PORT}/json/close/{tid}",
                    method="GET",
                )
                urllib.request.urlopen(req, timeout=3)
                closed += 1
                print(f"[KPP] 탭 닫음: {t.get('title')} {t.get('url', '')[:60]}")
            except Exception as e:
                print(f"[KPP] 탭 닫기 실패: {e}")
    except Exception as e:
        print(f"[KPP] 탭 목록 실패: {e}")
    return closed


def _print_pdf_file(
    pdf_path: str,
    title: str = "KPP_EDI",
    rotate_deg: int = 90,
) -> tuple[bool, str]:
    """
    Chrome 인쇄 버튼 사용 안 함.
    2026-08-09: GDI 비트맵(150dpi) 경로 폐기.
    1) PDF 벡터 회전(fitz set_rotation) 후 ShellExecute printto Canon
    2) 회전 실패 시 원본 PDF printto
    3) os.startfile print (최후)

    rotate_deg: PDF 페이지 회전 각도 (기본 90, 물류 전표 방향).
    """
    if not pdf_path or not os.path.isfile(pdf_path):
        return False, "PDF 파일 없음"
    size = os.path.getsize(pdf_path)
    if size < 1000:
        return False, f"PDF 크기 이상 ({size})"

    printer = (
        os.environ.get("DEPARTURE_PRINTER_NAME")
        or os.environ.get("KPP_PRINTER_NAME")
        or "Canon G2010 series"
    ).strip()

    # 1) 벡터 회전 PDF 생성 (비트맵 렌더 없음)
    rotated_path = pdf_path
    rot = int(rotate_deg or 0) % 360
    if rot:
        try:
            import fitz

            doc = fitz.open(pdf_path)
            for i in range(len(doc)):
                page = doc[i]
                page.set_rotation((page.rotation + rot) % 360)
            rotated_path = pdf_path.replace(".pdf", f"_r{rot}.pdf")
            doc.save(rotated_path)
            doc.close()
        except Exception as e:
            print(f"[KPP] 회전 PDF 생성 실패 → 원본 printto: {e}")
            rotated_path = pdf_path
            rot = 0

    # 2) printto 벡터 전송 (표준)
    try:
        import win32api

        win32api.ShellExecute(
            0,
            "printto",
            rotated_path,
            f'"{printer}"',
            os.path.dirname(rotated_path) or ".",
            0,
        )
        return True, (
            f"printto 벡터 전송 (회전 {rot}°, {size:,} bytes, {printer})"
        )
    except Exception as e:
        print(f"[KPP] ShellExecute printto 실패: {e}")

    # 3) startfile 최후 수단 (기본 프린터 주의 — ZM600 함정)
    try:
        os.startfile(rotated_path, "print")
        return True, f"os.startfile print 전송 ({size:,} bytes) ⚠️기본프린터"
    except Exception as e:
        return False, f"모든 인쇄 경로 실패: {e}"



def print_edi(
    hoche: int,
    date_str: str | None = None,
    page: CdpPage | None = None,
    skip_search: bool = False,
) -> dict:
    """EDI 전표 출력: PDF 저장 후 GDI(90°) — Chrome 인쇄 버튼 미사용.

    중요: 툴바 `#ediRegister` 클릭만으로는 PDF 가 안 뜨는 경우가 있음.
    WPPS 는 `fn_print()` 호출 시 `popupIframe3` 에
    `/ps/pdfs_preview/PMV761RR?...` 를 로드함 (실측 2026-07-26).
    """
    from datetime import date as dt_date

    t0 = time.time()
    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")

    _close_tabs_matching(["PMV761", "chrome-extension://", "blob:"])

    own_page = page is None
    if own_page:
        page = _ensure_pbm140_page()
    try:
        def _invoke_fn_print_once() -> tuple[str, list[str]]:
            """행 선택 후 fn_print (userGesture). 알림 메시지 반환."""
            _mute_dialogs(page)
            closed = _close_wpps_notices(page)
            if closed:
                print(f"[KPP] 공지 닫기: {closed}")
            if not skip_search:
                _search_today(page, date_str, wait=2.0)
            # plate digits optional — 호차 col0/col36
            row = _find_row(page, hoche, "")
            if row is None:
                rc = _grid_row_count(page)
                if rc and rc > 0:
                    row = 0
                    print(f"[KPP] 호차 매칭 실패 → 행0 폴백 (rc={rc})")
                else:
                    return "no-row", _pop_alerts(page)
            # 체크박스 선택 (setValue + cell.value 둘 다)
            page.js(
                f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const chk = (typeof gfn_getColumnIndex==='function')
    ? gfn_getColumnIndex(aoColumns, 'chk') : 1;
  const rc = s.getRowCount();
  for (let i=0;i<rc;i++) {{
    s.setValue(i, chk, false);
    try {{ s.getCell(i, chk).value(false); }} catch(e) {{}}
  }}
  s.setValue({int(row)}, chk, true);
  try {{ s.getCell({int(row)}, chk).value(true); }} catch(e) {{}}
  s.setSelection({int(row)}, 0, 1, 66);
  s.setActiveCell({int(row)}, 0);
  try {{ if (typeof s.endEdit === 'function') s.endEdit(true); }} catch(e) {{}}
  return {{row:{int(row)}, chk: s.getValue({int(row)}, chk)}};
}})()
"""
            )
            time.sleep(0.3)
            _pop_alerts(page)  # clear pre-print noise
            # userGesture 필수 — page.js 기본 호출은 Uncaught/무반응 사례 있음
            click_r = page.js(
                """
(() => {
  if (typeof fn_print === 'function') {
    try { fn_print(); return 'fn_print'; } catch (e) { return 'fn_print_err:' + e; }
  }
  const b = document.getElementById('ediRegister');
  if (b) { b.click(); return 'ediRegister_click'; }
  if (typeof fn_ediRegister === 'function') { fn_ediRegister(); return 'fn_ediRegister'; }
  return 'no-btn';
})()
""",
                user_gesture=True,
            )
            time.sleep(0.4)
            alerts = _pop_alerts(page)
            return str(click_r or "none"), alerts

        def _score_pdf_url(u: str) -> int:
            """PMV761 / pdfs 경로 우선. PBM140 자기 iframe 은 제외."""
            if not u:
                return -1
            # chrome PDF viewer 가 &amp; 로 인코딩한 URL 도 허용
            u_norm = u.replace("&amp;", "&")
            if "PBM140" in u_norm and "PMV" not in u_norm:
                return -1
            s = 0
            if "PMV761" in u_norm:
                s += 40
            if "/ps/pdfs/" in u_norm and "pdfs_preview" not in u_norm:
                s += 50
            if "pdfs_preview" in u_norm:
                s += 35
            if u_norm.lower().endswith(".pdf"):
                s += 20
            if "blob:" in u_norm:
                s += 15
            if "wpps" in u_norm.lower() and "PMV" in u_norm:
                s += 5
            return s

        def _collect_candidate_urls() -> list[tuple[int, str, dict | None]]:
            found: list[tuple[int, str, dict | None]] = []
            try:
                dom = page.js(
                    """
(() => {
  const out = [];
  for (const f of document.querySelectorAll('iframe')) {
    const s = f.src || f.getAttribute('src') || '';
    if (s) out.push(s);
  }
  for (const e of document.querySelectorAll('embed, object')) {
    const s = e.src || e.getAttribute('data') || e.getAttribute('src') || '';
    if (s) out.push(s);
  }
  return out;
})()
"""
                )
                for u in dom or []:
                    sc = _score_pdf_url(u)
                    if sc > 0:
                        found.append((sc, u.replace("&amp;", "&"), None))
            except Exception as e:
                print(f"[KPP] DOM iframe 스캔 실패: {e}")
            try:
                for t in list_tabs():
                    u = (t.get("url") or "").replace("&amp;", "&")
                    typ = t.get("type") or ""
                    sc = _score_pdf_url(u)
                    if sc > 0:
                        found.append((sc, u, t))
                    elif typ in ("page", "iframe") and "PMV761" in u:
                        found.append((45, u, t))
            except Exception as e:
                print(f"[KPP] CDP 탭 스캔 실패: {e}")
            found.sort(key=lambda x: -x[0])
            return found

        def _wait_pdf_url(click_r: str, seconds: float = 12.0) -> tuple[str | None, dict | None]:
            pdf_url = None
            pdf_tab = None
            preview_fallback = None
            n = max(8, int(seconds / 0.3))
            for i in range(n):
                time.sleep(0.3)
                cands = _collect_candidate_urls()
                if not cands:
                    if i in (3, 10) and click_r == "fn_print":
                        page.js(
                            "typeof fn_print==='function' && fn_print()",
                            user_gesture=True,
                        )
                    continue
                best_sc, best_u, best_t = cands[0]
                if best_sc >= 35:
                    print(
                        f"[KPP] EDI URL 감지 t={0.3*(i+1):.1f}s score={best_sc} "
                        f"{best_u[:100]}"
                    )
                    return best_u, best_t
                if preview_fallback is None and best_sc > 0:
                    preview_fallback = (best_u, best_t)
            if preview_fallback:
                return preview_fallback[0], preview_fallback[1]
            return pdf_url, pdf_tab

        def _session_error(alerts: list[str]) -> bool:
            blob = " ".join(alerts).lower()
            return any(
                k in blob
                for k in (
                    "parsererror",
                    "doctype",
                    "재로그인",
                    "로그인이 필요",
                    "unexpected token",
                    "not valid json",
                )
            )

        # --- 1차 시도 ---
        before_ids = {t.get("id") for t in list_tabs()}
        click_r, alerts = _invoke_fn_print_once()
        print(f"[KPP] EDI/인쇄 호출: {click_r} alerts={alerts[:3]}")
        if click_r == "no-row":
            return {
                "ok": False,
                "error": f"{hoche}호차 행 없음 — 먼저 등록 필요",
                "alerts": alerts,
                "elapsed_s": round(time.time() - t0, 2),
            }

        pdf_url, pdf_tab = _wait_pdf_url(click_r, seconds=10.0)

        # 세션 만료/AJAX HTML 응답 시 재로그인 후 1회 재시도
        if not pdf_url and (
            _session_error(alerts) or click_r.startswith("fn_print_err")
        ):
            print("[KPP] 인쇄 세션 이상 → 재로그인 후 재시도")
            try:
                login_r = step_login(wait_manual_sec=8)
                print(f"[KPP] 재로그인: {login_r.get('ok')} {login_r.get('url')}")
                reg_r = step_register()
                print(f"[KPP] PBM140 재진입: {reg_r.get('ok')}")
                # page handle 재연결
                if own_page:
                    try:
                        page.close()
                    except Exception:
                        pass
                    page = _ensure_pbm140_page()
                click_r, alerts = _invoke_fn_print_once()
                print(f"[KPP] 재시도 인쇄: {click_r} alerts={alerts[:3]}")
                pdf_url, pdf_tab = _wait_pdf_url(click_r, seconds=12.0)
            except Exception as re_err:
                print(f"[KPP] 재로그인 재시도 실패: {re_err}")

        if not pdf_url:
            try:
                ifr = page.js(
                    """
(() => [...document.querySelectorAll('iframe')].map(f => f.src||f.id||''))()
"""
                )
            except Exception:
                ifr = None
            alert_hint = ("; ".join(alerts))[:300] if alerts else ""
            return {
                "ok": False,
                "error": (
                    "EDI PDF URL 없음 (fn_print 후 iframe 미감지 — "
                    "행 선택·WPPS 세션 확인)"
                    + (f" | alert={alert_hint}" if alert_hint else "")
                ),
                "click": click_r,
                "alerts": alerts,
                "iframes": ifr,
                "elapsed_s": round(time.time() - t0, 2),
            }

        # preview URL → 바이너리 PDF 경로 후보
        if "pdfs_preview" in pdf_url:
            print(f"[KPP] preview URL 확보: {pdf_url[:120]}")

        print(f"[KPP] EDI URL: {pdf_url[:120]}")

        page.cmd("Network.enable")
        r = page.cmd(
            "Network.getCookies",
            {"urls": ["https://wpps.logisall.net"]},
        )
        cookies = r.get("result", {}).get("cookies", [])
        cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
        pdf_path = os.path.join(
            os.environ.get("TEMP", r"C:\Temp"),
            f"kpp_edi_{hoche}hoca.pdf",
        )

        def _download(url: str) -> bytes:
            import urllib.request as ur

            req = ur.Request(
                url,
                headers={
                    "Cookie": cookie_str,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                    "Referer": PBM140_URL,
                    "Accept": "application/pdf,*/*",
                },
            )
            with ur.urlopen(req, timeout=30) as resp:
                return resp.read()

        data = b""
        urls_try = [pdf_url]
        if "pdfs_preview" in pdf_url:
            urls_try.insert(0, pdf_url.replace("pdfs_preview", "pdfs"))
        if "/ps/pdfs/" in pdf_url and "pdfs_preview" not in pdf_url:
            # 일부 세션은 preview 만 동작
            urls_try.append(pdf_url.replace("/ps/pdfs/", "/ps/pdfs_preview/"))

        last_err = None
        used_url = pdf_url
        for u in urls_try:
            try:
                data = _download(u)
                used_url = u
                print(f"[KPP] PDF 다운로드 {len(data):,} bytes from {u[:90]}")
                if len(data) >= 1000 and data[:4] == b"%PDF":
                    break
                if len(data) >= 1000 and b"%PDF" in data[:2000]:
                    # 앞에 잡음 있으면 PDF 시작점 찾기
                    idx = data.find(b"%PDF")
                    if idx > 0:
                        data = data[idx:]
                    break
            except Exception as e:
                last_err = e
                print(f"[KPP] 다운로드 실패 {u[:80]}: {e}")
                data = b""

        if not data and last_err:
            return {
                "ok": False,
                "error": f"PDF 다운로드 실패: {last_err}",
                "pdf_url": pdf_url,
                "elapsed_s": round(time.time() - t0, 2),
            }

        if len(data) < 1000 or not data.startswith(b"%PDF"):
            return {
                "ok": False,
                "error": f"PDF 데이터 이상 size={len(data)} head={data[:40]!r}",
                "pdf_url": used_url,
                "elapsed_s": round(time.time() - t0, 2),
            }
        pdf_url = used_url

        with open(pdf_path, "wb") as f:
            f.write(data)
        print(f"[KPP] PDF 저장: {pdf_path} ({len(data):,} bytes)")

        # page 탭만 정리 (iframe close 금지 — CDP 크래시 방지)
        _close_tabs_matching(["PMV761", "PMV"])
        if pdf_tab and pdf_tab.get("type") == "page" and pdf_tab.get("id"):
            try:
                urllib.request.urlopen(
                    f"http://localhost:{CDP_PORT}/json/close/{pdf_tab['id']}",
                    timeout=2,
                )
            except Exception:
                pass
        # 모달/iframe 잔여: ESC 로 닫기 시도
        try:
            page.js(
                """
(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', keyCode:27, bubbles:true}));
  const btns = document.querySelectorAll('button, a, .close, .btn-close');
  for (const b of btns) {
    const t = (b.innerText || b.textContent || b.getAttribute('title') || '');
    if (/닫기|close|취소/i.test(t)) { try { b.click(); } catch(e) {} }
  }
  return true;
})()
"""
            )
        except Exception:
            pass

        ok_print, msg = _print_pdf_file(pdf_path, title=f"KPP_EDI_{hoche}")
        return {
            "ok": ok_print,
            "hoche": hoche,
            "pdf": pdf_path,
            "message": msg if ok_print else None,
            "error": None if ok_print else msg,
            "elapsed_s": round(time.time() - t0, 2),
        }
    finally:
        if own_page and page:
            page.close()


def register_and_print_from_departure(
    hoche: int = 1,
    plt: int | None = None,
    date_str: str | None = None,
    do_print: bool = True,
) -> dict:
    """
    Departure DB 차량 + 파렛트 수량으로 KPP 등록 후 (옵션) 인쇄.

    운영 UI(📦 KPP) 전용 경로:
      등록(갱신) → EDI 인쇄 만 수행. 삭제(fn_delete) 절대 호출 안 함.
    """
    from datetime import date as dt_date

    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")

    # Django Departure
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    try:
        from django.apps import apps as django_apps

        if not django_apps.ready:
            django.setup()
    except Exception:
        django.setup()
    from departure.services.vehicle_order import vehicle_order_service

    order = vehicle_order_service.get_today_order(date_str)
    veh = next((v for v in order if int(v.get("hoche") or 0) == int(hoche)), None)
    if not veh:
        return {"ok": False, "error": f"Departure에 {hoche}호차 없음 ({date_str})"}

    # 파렛트: 명시값 > vehicle-extras(>0) 만. 기본 12 강제 없음
    if plt is None or int(plt) <= 0:
        plt = 0
        extras_path = os.path.join(
            BASE_DIR, "departure", "data", f"vehicle_extras_{date_str}.json"
        )
        if os.path.isfile(extras_path):
            try:
                with open(extras_path, encoding="utf-8") as f:
                    ex = json.load(f)
                hkey = str(hoche)
                if isinstance(ex, dict):
                    block = ex.get("extras") or ex
                    if hkey in block and block[hkey].get("plt"):
                        try:
                            ex_plt = int(block[hkey]["plt"])
                            if ex_plt > 0:
                                plt = ex_plt
                        except (TypeError, ValueError):
                            pass
            except Exception:
                pass
    if int(plt or 0) <= 0:
        return {
            "ok": False,
            "error": "plt_required",
            "message": "파렛트 수량이 없습니다. 출차 카드에서 수량을 입력한 뒤 KPP 등록하세요.",
            "vehicle": veh,
            "plt": 0,
        }

    out: dict = {
        "register": None,
        "print": None,
        "vehicle": veh,
        "plt": plt,
        "ok": False,
        "path": "register_then_print_no_delete",
    }

    # 한 세션에서 등록→인쇄 (삭제 없음)
    page = _ensure_pbm140_page()
    try:
        reg = register_vehicle(
            hoche=int(hoche),
            plate=veh.get("plate") or "",
            driver=veh.get("driver") or "",
            phone=veh.get("phone") or "",
            plt=int(plt),
            date_str=date_str,
            page=page,
        )
        out["register"] = reg
        if not reg.get("ok"):
            return out

        # Departure extras 에 plt 저장 (페이지 파렛트 칸 동기화)
        try:
            extras_path = os.path.join(
                BASE_DIR, "departure", "data", f"vehicle_extras_{date_str}.json"
            )
            data = {}
            if os.path.isfile(extras_path):
                with open(extras_path, encoding="utf-8") as f:
                    data = json.load(f) or {}
            if "extras" not in data:
                if any(str(k).isdigit() for k in data.keys()):
                    data = {"extras": data}
                else:
                    data = {"extras": data.get("extras") or {}}
            data["extras"][str(hoche)] = {
                **(data["extras"].get(str(hoche)) or {}),
                "plt": int(plt),
            }
            with open(extras_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[KPP] extras 저장 스킵: {e}")

        if do_print:
            # 등록 직후 같은 페이지에서 조회·인쇄
            out["print"] = print_edi(
                int(hoche), date_str, page=page, skip_search=False
            )
            out["ok"] = bool(out["print"].get("ok"))
        else:
            out["ok"] = True
        return out
    finally:
        page.close()


def batch_delete_register_print(
    hoches: list[int],
    plt: int = 0,
    date_str: str | None = None,
    delete_first: bool = False,
) -> dict:
    """
    CLI 배치 (UI 미사용).

      1) 한 번 PBM140 연결
      2) delete_first=True 일 때만 지정 호차 삭제 (기본 False — 운영 안전)
      3) 각 호차 등록
      4) 각 호차 인쇄

    ⚠️ 삭제 기본 끔. UI 📦 KPP 는 이 함수를 쓰지 않음.
    ⚠️ plt 기본 0 — 호출 시 명시 필요 (기본 12 제거).
    """
    from datetime import date as dt_date

    t0 = time.time()
    if not date_str:
        date_str = dt_date.today().strftime("%Y-%m-%d")

    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    try:
        from django.apps import apps as django_apps

        if not django_apps.ready:
            django.setup()
    except Exception:
        django.setup()
    from departure.services.vehicle_order import vehicle_order_service

    order = {
        int(v["hoche"]): v for v in vehicle_order_service.get_today_order(date_str)
    }
    page = _ensure_pbm140_page()
    report: dict = {
        "delete": None,
        "register": [],
        "print": [],
        "ok": True,
        "timing": {},
    }
    try:
        if delete_first:
            t1 = time.time()
            report["delete"] = delete_hoches(hoches, date_str, page=page)
            report["timing"]["delete_s"] = round(time.time() - t1, 2)

        # 호차별 등록(갱신) — 삭제 없이, 저장은 호차마다 확실히
        t1 = time.time()
        for h in hoches:
            veh = order.get(int(h))
            if not veh:
                report["register"].append(
                    {"ok": False, "hoche": h, "error": "Departure 없음"}
                )
                report["ok"] = False
                continue
            reg = register_vehicle(
                hoche=int(h),
                plate=veh.get("plate") or "",
                driver=veh.get("driver") or "",
                phone=veh.get("phone") or "",
                plt=int(plt),
                date_str=date_str,
                page=page,
            )
            report["register"].append(reg)
            if not reg.get("ok"):
                report["ok"] = False
        report["timing"]["batch_register_s"] = round(time.time() - t1, 2)

        t1 = time.time()
        rc = _search_today(page, date_str, wait=2.5)
        report["timing"]["verify_search_s"] = round(time.time() - t1, 2)
        report["rows_after_register"] = rc
        # 검증 로그
        for h in hoches:
            ridx = _find_row(page, int(h), "")
            report.setdefault("verify_rows", {})[str(h)] = ridx

        for h in hoches:
            t1 = time.time()
            # 매 인쇄 전 짧은 재조회 (행 누락 방지)
            pr = print_edi(int(h), date_str, page=page, skip_search=False)
            if "elapsed_s" not in pr:
                pr["elapsed_s"] = round(time.time() - t1, 2)
            report["print"].append(pr)
            if not pr.get("ok"):
                report["ok"] = False
    finally:
        page.close()

    report["timing"]["total_s"] = round(time.time() - t0, 2)
    return report


def main():
    parser = argparse.ArgumentParser(description="KPP WPPS 단계별 세션")
    parser.add_argument(
        "--step",
        choices=[
            "launch",
            "login",
            "register",
            "status",
            "all",
            "reg1",
            "print1",
            "regprint1",
            "check1",
            "batch23",
        ],
        default="all",
        help="진행 단계 (check1=기존 등록 확인, batch23=2·3호 등록+인쇄·삭제 없음)",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=180,
        help="수동 로그인 대기 초 (기본 180)",
    )
    parser.add_argument("--hoche", type=int, default=1, help="호차 (기본 1)")
    parser.add_argument(
        "--plt",
        type=int,
        default=0,
        help="파렛트 수량 (필수, 0이면 등록 거부 — 기본 12 제거)",
    )
    parser.add_argument("--date", type=str, default="", help="YYYY-MM-DD")
    args = parser.parse_args()

    print("=" * 60)
    print(" KPP WPPS 단계 진행")
    print(f"  step={args.step}")
    print("=" * 60)

    if args.step == "status":
        print(json.dumps(step_status(), ensure_ascii=False, indent=2))
        return

    if args.step == "check1":
        # Departure 차량번호로 기존 등록 여부만 확인
        if str(BASE_DIR) not in sys.path:
            sys.path.insert(0, str(BASE_DIR))
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
        import django

        try:
            from django.apps import apps as django_apps

            if not django_apps.ready:
                django.setup()
        except Exception:
            django.setup()
        from datetime import date as dt_date
        from departure.services.vehicle_order import vehicle_order_service

        d = args.date or dt_date.today().strftime("%Y-%m-%d")
        order = vehicle_order_service.get_today_order(d)
        veh = next(
            (v for v in order if int(v.get("hoche") or 0) == int(args.hoche)), None
        )
        plate = (veh or {}).get("plate") or ""
        r = check_vehicle_registered(
            hoche=args.hoche, plate=plate, date_str=d
        )
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
        return

    if args.step == "reg1" or args.step == "regprint1":
        r = register_and_print_from_departure(
            hoche=args.hoche,
            plt=args.plt,
            date_str=args.date or None,
            do_print=(args.step == "regprint1"),
        )
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
        return

    if args.step == "batch23":
        # 기본 삭제 끔 (운영 안전). 강제 삭제 필요 시 --delete 별도 추가 전까지 수동 호출.
        r = batch_delete_register_print(
            hoches=[2, 3],
            plt=args.plt or 0,
            date_str=args.date or None,
            delete_first=False,
        )
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
        return

    if args.step == "print1":
        r = print_edi(args.hoche, args.date or None)
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    if args.step == "launch":
        print(json.dumps(step_launch(), ensure_ascii=False, indent=2))
        return

    if args.step == "login":
        print(json.dumps(step_login(args.wait), ensure_ascii=False, indent=2))
        return

    if args.step == "register":
        print(json.dumps(step_register(), ensure_ascii=False, indent=2))
        return

    # all
    r1 = step_launch()
    print("→ launch:", r1.get("ok"), r1.get("error", ""))
    r2 = step_login(args.wait)
    print("→ login:", r2.get("ok"), r2.get("mode") or r2.get("error", ""))
    if not r2.get("ok"):
        print("\n[안내] 브라우저에서 로그인 후 다음을 실행하세요:")
        print("  python kpp_session.py --step register")
        sys.exit(1)
    r3 = step_register()
    print("→ register:", r3.get("ok"), r3.get("url", ""))
    print("\n[다음] 등록 페이지가 보이면 알려 주세요. 그리드 조회·차량 등록을 이어서 진행합니다.")
    print(json.dumps({"launch": r1, "login": r2, "register": r3}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
