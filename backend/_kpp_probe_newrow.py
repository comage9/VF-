# -*- coding: utf-8 -*-
import json
import time
from datetime import date

from kpp_session import (
    _ensure_pbm140_page,
    _mute_dialogs,
    _search_today,
    _grid_row_count,
)

d = date.today().isoformat()
page = _ensure_pbm140_page()
_mute_dialogs(page)
print("search", _search_today(page, d, wait=2))
print("rc", _grid_row_count(page))
print("fn_newRow type", page.js("typeof fn_newRow"))

r = page.js(
    """
(() => {
  try {
    const c = GC.Spread.Sheets.findControl(document.getElementById('grid'));
    const s = c.getActiveSheet();
    const before = s.getRowCount();
    let via = '';
    if (typeof fn_newRow === 'function') {
      fn_newRow();
      via = 'fn_newRow';
    }
    let after = s.getRowCount();
    if (after <= before) {
      s.addRows(before, 1);
      after = s.getRowCount();
      via = via + '+addRows';
    }
    return {before: before, after: after, via: via, ok: after > before};
  } catch (e) {
    return {err: String(e)};
  }
})()
"""
)
print("add", r)
time.sleep(1.2)
print("rc2", _grid_row_count(page))

inj = page.js(
    """
(() => {
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  let r = s.getRowCount() - 1;
  if (r < 0) {
    s.addRows(0, 1);
    r = 0;
  }
  s.setValue(r, 1, true);
  s.setValue(r, 10, '610060');
  s.setValue(r, 12, '9999999999999');
  s.setValue(r, 14, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 15, 'N11');
  s.setValue(r, 18, 12);
  s.setValue(r, 20, '610060');
  s.setValue(r, 22, '쿠팡-부천1센터[HUB]');
  s.setValue(r, 31, '888047');
  s.setValue(r, 32, '이종민');
  s.setValue(r, 33, '01039831110');
  s.setValue(r, 36, '2호차');
  return {
    r: r,
    car: s.getValue(r, 31),
    h: s.getValue(r, 36),
    qty: s.getValue(r, 18),
    rc: s.getRowCount()
  };
})()
"""
)
print("inject", inj)
page.js("typeof fn_save==='function' && fn_save()")
time.sleep(2)
print("after save rows", _search_today(page, d, wait=2.5))
print(
    "grid",
    page.js(
        """
(() => {
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const out = [];
  for (let i = 0; i < s.getRowCount(); i++) {
    out.push({i:i, car:s.getValue(i,31), h:s.getValue(i,36), q:s.getValue(i,18), mod:s.getValue(i,2)});
  }
  return out;
})()
"""
    ),
)
page.close()
