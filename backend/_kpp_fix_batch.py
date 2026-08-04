# -*- coding: utf-8 -*-
"""
2·3호 등록+인쇄
- 반드시 fn_newRow 만 사용 (addRows 는 저장 시 행 유실)
- 호차마다 저장 확정 후 다음 호차
"""
import json
import os
import time
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from departure.services.vehicle_order import vehicle_order_service
from kpp_session import (
    _ensure_pbm140_page,
    _mute_dialogs,
    _search_today,
    _grid_row_count,
    _plate_digits,
    _phone_digits,
    delete_hoches,
    print_edi,
)


def list_rows(page):
    return page.js(
        """
(() => {
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const out = [];
  for (let i = 0; i < s.getRowCount(); i++) {
    out.push({
      i: i,
      car: s.getValue(i, 31),
      driver: s.getValue(i, 32),
      qty: s.getValue(i, 18),
      hoche: s.getValue(i, 36),
      mod: s.getValue(i, 2)
    });
  }
  return out;
})()
"""
    )


def reg_one(page, hoche, plate, driver, phone, plt, date_str):
    car = _plate_digits(plate)
    tel = _phone_digits(phone)
    label = f"{hoche}호차"

    rc0 = _search_today(page, date_str, wait=2.0)
    # 기존 호차?
    exist = page.js(
        f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  for (let i = 0; i < s.getRowCount(); i++) {{
    const h = String(s.getValue(i, 36) || '').replace(/호차/g,'').trim();
    if (h === '{hoche}') return i;
  }}
  return -1;
}})()
"""
    )
    if exist is not None and int(exist) >= 0:
        row = int(exist)
        via = "update"
    else:
        before = max(0, _grid_row_count(page))
        page.js("typeof fn_newRow==='function' && fn_newRow()")
        # 행 증가 대기
        row = before
        via = "fn_newRow"
        for _ in range(30):
            time.sleep(0.15)
            after = _grid_row_count(page)
            if after > before:
                row = after - 1
                break
        else:
            # 최후 수단 addRows (fn_newRow 실패 시)
            page.js(
                f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  s.addRows({before}, 1);
}})()
"""
            )
            time.sleep(0.5)
            row = max(0, _grid_row_count(page) - 1)
            via = "addRows-fallback"

    inj = page.js(
        f"""
(() => {{
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const r = {row};
  s.setValue(r, 1, true);
  s.setValue(r, 10, '610060');
  s.setValue(r, 12, '9999999999999');
  s.setValue(r, 14, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 15, 'N11');
  s.setValue(r, 18, {plt});
  s.setValue(r, 20, '610060');
  s.setValue(r, 22, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 31, {json.dumps(car)});
  s.setValue(r, 32, {json.dumps(driver)});
  s.setValue(r, 33, {json.dumps(tel)});
  s.setValue(r, 36, {json.dumps(label)});
  return {{
    via: {json.dumps(via)}, r: r, rc: s.getRowCount(),
    car: s.getValue(r,31), driver: s.getValue(r,32),
    qty: s.getValue(r,18), hoche: s.getValue(r,36), mod: s.getValue(r,2)
  }};
}})()
"""
    )
    print("INJECT", hoche, inj)
    _mute_dialogs(page)
    page.js("typeof fn_save==='function' && fn_save()")
    time.sleep(2.2)
    rc = _search_today(page, date_str, wait=2.5)
    rows = list_rows(page)
    print("AFTER SAVE", hoche, "rc", rc, rows)
    ok = any(
        str(x.get("hoche") or "").replace("호차", "") == str(hoche)
        or str(x.get("car") or "") == car
        for x in (rows or [])
    )
    return {"ok": ok, "inject": inj, "grid": rows}


def main():
    t0 = time.time()
    d = date.today().strftime("%Y-%m-%d")
    order = {int(v["hoche"]): v for v in vehicle_order_service.get_today_order(d)}
    page = _ensure_pbm140_page()
    try:
        _mute_dialogs(page)
        print("BEFORE", list_rows(page) if _search_today(page, d, 2) >= 0 else [])
        print("DEL", delete_hoches([2, 3], d, page=page))

        results = []
        for h in (2, 3):
            v = order[h]
            r = reg_one(
                page,
                h,
                v.get("plate") or "",
                v.get("driver") or "",
                v.get("phone") or "",
                12,
                d,
            )
            results.append(r)

        prints = []
        for h in (2, 3):
            pr = print_edi(h, d, page=page, skip_search=False)
            prints.append(pr)
            print("PRINT", h, pr)

        print(
            "TOTAL",
            json.dumps(
                {
                    "reg": results,
                    "prints": prints,
                    "total_s": round(time.time() - t0, 2),
                },
                ensure_ascii=False,
                indent=2,
                default=str,
            ),
        )
    finally:
        page.close()


if __name__ == "__main__":
    main()
