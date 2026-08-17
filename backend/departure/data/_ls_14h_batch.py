# -*- coding: utf-8 -*-
import json, os, sys, time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, r"E:/coding/VF-new/backend")
import ls_automation as la

TODAY = datetime.now().strftime("%Y-%m-%d")
DATA = Path(r"E:/coding/VF-new/backend/departure/data")
TEMPLATES = [90626, 90628, 90269]

la.load_env()
ls_id = os.environ.get("LS_USERNAME") or os.environ.get("LS_ID")
ls_pw = os.environ.get("LS_PASSWORD")
print("date=%s user=%s" % (TODAY, ls_id))

print("[1] login via patchright...")
cookies = la.login_and_get_cookies(ls_id, ls_pw)
print("cookies=%s" % len(cookies))
if not cookies:
    print("LOGIN_FAIL")
    sys.exit(2)

ns = DATA / "ls_cookies.txt"
with open(ns, "w", encoding="utf-8") as f:
    f.write("# Netscape HTTP Cookie File" + chr(10))
    for name, val in cookies.items():
        dom = "ls.coupang.com" if name in ("WEB-GATEWAY-SESSION", "SESSION") else ".coupang.com"
        f.write("%s	TRUE	/	FALSE	0	%s	%s%s" % (dom, name, val, chr(10)))
print("saved cookies")

print("[2] query orders...")
orders = la.fetch_orders(cookies, TODAY)
try:
    from curl_cffi import requests as creq
except Exception as e:
    creq = None
    print("no curl_cffi", e)

headers = {
    "Accept": "application/json",
    "Referer": "https://ls.coupang.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://ls.coupang.com",
    "Content-Type": "application/json",
}

def query_all():
    url = (
        "https://ls.coupang.com/data/truckOrderTracking?page=0&pageSize=200"
        "&orderStartDate=%s&orderEndDate=%s&locationStart=VF67_H"
        "&statuses=SUBMITTED,CONFIRMED,CANCELED,BACK" % (TODAY, TODAY)
    )
    if creq is None:
        return orders or []
    r = creq.get(url, cookies=cookies, headers=headers, impersonate="chrome", timeout=30, allow_redirects=True)
    print("query status=%s len=%s" % (r.status_code, len(r.text)))
    if r.status_code != 200 or r.text.lstrip().startswith("<!"):
        print("query body snip=%r" % r.text[:200])
        return orders or []
    data = r.json()
    content = (data.get("data") or {}).get("content") or []
    print("totalElements=%s content=%s" % ((data.get("data") or {}).get("totalElements"), len(content)))
    return content

content = query_all()
print("[before] %s" % len(content))
for o in content[:5]:
    print(" ", o.get("truckRequestId"), o.get("truckOrderTemplateId"), o.get("status"))

result = {"date": TODAY, "before": len(content), "ok": False, "orders": [], "create": []}

if len(content) >= 3:
    result["ok"] = True
    result["message"] = "already registered"
    result["orders"] = [{"id": o.get("truckRequestId"), "tpl": o.get("truckOrderTemplateId"), "status": o.get("status")} for o in content]
else:
    print("[3] batch create...")
    endpoints = [
        ("POST", "https://ls.coupang.com/truckOrder/templates/batch/creation/%s" % TODAY, TEMPLATES),
        ("POST", "https://ls.coupang.com/data/truckOrder/templates/batch/creation/%s" % TODAY, TEMPLATES),
        ("POST", "https://ls.coupang.com/truckOrder/templates/batch/creation/%s" % TODAY, {"templateIds": TEMPLATES}),
        ("PUT", "https://ls.coupang.com/truckOrder/templates/checkTemplate/%s" % TODAY, TEMPLATES),
    ]
    if creq is None:
        print("cannot POST without curl_cffi")
    else:
        for method, url, body in endpoints:
            if method == "POST":
                r = creq.post(url, json=body, cookies=cookies, headers=headers, impersonate="chrome", timeout=30, allow_redirects=True)
            else:
                r = creq.put(url, json=body, cookies=cookies, headers=headers, impersonate="chrome", timeout=30, allow_redirects=True)
            snip = r.text[:300]
            print("create %s %s -> %s %r" % (method, url, r.status_code, snip))
            result["create"].append({"url": url, "status": r.status_code, "body": snip})
            if r.status_code in (200, 201) and not r.text.lstrip().startswith("<!"):
                break
    time.sleep(2)
    content2 = query_all()
    print("[after] %s" % len(content2))
    result["after"] = len(content2)
    result["orders"] = [{"id": o.get("truckRequestId"), "tpl": o.get("truckOrderTemplateId"), "status": o.get("status")} for o in content2]
    result["ok"] = len(content2) >= 1
    result["message"] = "after create: %s" % len(content2)
    if content2:
        norm = []
        for o in content2:
            ti = o.get("truckInfo") or {}
            norm.append({
                "truckRequestId": o.get("truckRequestId"),
                "templateId": o.get("truckOrderTemplateId"),
                "plateNumber": ti.get("plateNumber") if isinstance(ti, dict) else None,
                "driverName": ti.get("driverName") if isinstance(ti, dict) else None,
                "driverPhone": ti.get("driverPhone") if isinstance(ti, dict) else None,
                "requestTimeEpoch": o.get("requestTimeEpoch"),
                "orderDate": o.get("orderDate") or TODAY,
                "status": o.get("status"),
            })
        (DATA / ("ls_orders_%s.json" % TODAY)).write_text(json.dumps(norm, ensure_ascii=False, indent=2), encoding="utf-8")

out = DATA / ("ls_14h_loop_%s.json" % TODAY)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print("FINAL", json.dumps(result, ensure_ascii=False)[:1500])
sys.exit(0 if result.get("ok") else 1)
