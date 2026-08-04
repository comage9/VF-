# -*- coding: utf-8 -*-
"""3호차 중복 행 정리: 3호차 전부 삭제 후 1건만 재등록(옵션)."""
import json
import time
from datetime import date

from kpp_session import (
    _ensure_pbm140_page,
    _mute_dialogs,
    _search_today,
    delete_hoches,
    register_vehicle,
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
      hoche: String(s.getValue(i, 36) || ''),
      mod: s.getValue(i, 2)
    });
  }
  return out;
})()
"""
    )


def main():
    d = date.today().isoformat()
    page = _ensure_pbm140_page()
    try:
        _mute_dialogs(page)
        print("=== BEFORE ===")
        print("search", _search_today(page, d, wait=2.5))
        before = list_rows(page)
        print(json.dumps(before, ensure_ascii=False, indent=2))

        # 3호차 전부 삭제 (중복 포함)
        print("=== DELETE hoche 3 ===")
        r = delete_hoches([3], d, page=page)
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))

        # 혹시 차량번호 901703 남은 행도 체크 삭제
        _search_today(page, d, wait=2.0)
        extra = page.js(
            """
(() => {
  const s = GC.Spread.Sheets.findControl(document.getElementById('grid')).getActiveSheet();
  const rc = s.getRowCount();
  let n = 0;
  for (let i = 0; i < rc; i++) s.setValue(i, 1, false);
  for (let i = 0; i < rc; i++) {
    const car = String(s.getValue(i, 31) || '');
    const h = String(s.getValue(i, 36) || '');
    if (car === '901703' || h.indexOf('3') === 0 || h === '3호차') {
      s.setValue(i, 1, true);
      n++;
    }
  }
  return n;
})()
"""
        )
        print("extra checked rows", extra)
        if extra and int(extra) > 0:
            page.js(
                """
(() => {
  if (typeof fn_delete === 'function') fn_delete();
})()
"""
            )
            time.sleep(0.5)
            page.js("typeof fn_save==='function' && fn_save()")
            time.sleep(1.5)
            _search_today(page, d, wait=2.0)

        after = list_rows(page)
        print("=== AFTER DELETE ===")
        print(json.dumps(after, ensure_ascii=False, indent=2))
        print("DONE — 3호 중복 제거. (재등록은 요청 시)")
    finally:
        page.close()


if __name__ == "__main__":
    main()
