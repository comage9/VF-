#!/usr/bin/env python3
"""VF Production API helper script"""

import json
import sys
import urllib.request

BASE_URL = "http://bonohouse.p-e.kr:5174/api"

def api_get(path):
    req = urllib.request.Request(f"{BASE_URL}/{path}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_post(path, data):
    req = urllib.request.Request(
        f"{BASE_URL}/{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_delete(path, data=None):
    req = urllib.request.Request(
        f"{BASE_URL}/{path}",
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"} if data else {},
        method="DELETE"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_put(path, data):
    req = urllib.request.Request(
        f"{BASE_URL}/{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python production_api.py <command> [args]")
        print("Commands: list | add | delete <id> | copy <from_date> <to_date>")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "list":
        d = api_get("production")
        for dt in d.get("allDates", []):
            records = [r for r in d["data"] if r["date"] == dt]
            total = sum(r["total"] for r in records)
            print(f"{dt}: {len(records)}건, 총 {total:,}개")

    elif cmd == "add":
        if len(sys.argv) < 5:
            print("Usage: add <date> <machine> <product_name> <color1> [color2] [qty] [unit_qty]")
            sys.exit(1)
        record = {
            "date": sys.argv[2],
            "machineNumber": sys.argv[3],
            "productName": sys.argv[4],
            "color1": sys.argv[5] if len(sys.argv) > 5 else "",
            "color2": sys.argv[6] if len(sys.argv) > 6 else "",
            "quantity": int(sys.argv[7]) if len(sys.argv) > 7 else 1,
            "unitQuantity": int(sys.argv[8]) if len(sys.argv) > 8 else 0,
            "status": "pending",
        }
        result = api_post("production-log", record)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif cmd == "delete":
        if len(sys.argv) < 3:
            print("Usage: delete <id>")
            sys.exit(1)
        result = api_delete(f"production-log/{sys.argv[2]}")
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif cmd == "copy":
        if len(sys.argv) < 4:
            print("Usage: copy <from_date> <to_date>")
            sys.exit(1)
        from_date, to_date = sys.argv[2], sys.argv[3]
        d = api_get("production")
        records = [r for r in d["data"] if r["date"] == from_date]
        created = 0
        for r in records:
            payload = {
                "date": to_date,
                "machineNumber": r["machineNumber"],
                "moldNumber": r["moldNumber"],
                "productName": r["productName"],
                "productNameEng": r.get("productNameEng", ""),
                "color1": r["color1"],
                "color2": r["color2"],
                "unit": r.get("unit", ""),
                "quantity": r["quantity"],
                "unitQuantity": r["unitQuantity"],
                "status": "pending",
            }
            api_post("production-log", payload)
            created += 1
        print(f"Copied {created} records from {from_date} to {to_date}")

    else:
        print(f"Unknown command: {cmd}")
