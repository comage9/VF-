# -*- coding: utf-8 -*-
"""
쿠팡 발주서 VF 품목 CSV를 읽어 MasterSpec.is_vf_item + vf_registered_at 동기화.

매칭 우선순위: 바코드 → SKU ID → 제품명
기본: CSV 매칭 품목만 True (기존 True 유지: --no-reset)
"""
from __future__ import annotations

import csv
import os
import re
from datetime import date, datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from sales_api.models import MasterSpec


def _norm(s: str) -> str:
    return (s or "").strip()


def _parse_reg_date(raw: str) -> date | None:
    """CSV '등록 일자' 파싱. 예: 2025-11-15, 24- 12- 04, 23- 06- 20."""
    s = _norm(raw)
    if not s or s.lower() in ("nan", "none", "-"):
        return None
    # 공백 제거: "24- 12- 04" → "24-12-04"
    s = re.sub(r"\s+", "", s)
    s = s.replace(".", "-").replace("/", "-")
    # YYYY-MM-DD
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    # YY-MM-DD (2000+)
    m = re.match(r"^(\d{2})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        yy, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        year = 2000 + yy if yy < 100 else yy
        try:
            return date(year, mm, dd)
        except ValueError:
            return None
    m = re.match(r"^(\d{4})(\d{2})(\d{2})$", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


class Command(BaseCommand):
    help = "쿠팡 발주서 VF 품목 CSV로 is_vf_item + vf_registered_at 동기화"

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_path",
            type=str,
            help="VF 품목 CSV 경로 (예: 쿠팡 발주서 - vf품목.csv)",
        )
        parser.add_argument(
            "--no-reset",
            action="store_true",
            help="기존 is_vf_item=True를 유지하고 CSV 매칭만 True로 추가",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help=(
                "위험: CSV에 없는 품목 is_vf_item=False. "
                "엑셀 SoT(865)와 다른 CSV면 건수가 깨짐. 기본 사용 금지."
            ),
        )

    def handle(self, *args, **options):
        path = options["csv_path"]
        if not os.path.isfile(path):
            raise CommandError(f"파일 없음: {path}")

        # --reset 이면 전체 동기화, 아니면 기본 --no-reset (매칭만 추가)
        do_reset = bool(options.get("reset")) and not bool(options.get("no_reset"))
        if options.get("no_reset"):
            do_reset = False
        if not options.get("reset") and not options.get("no_reset"):
            # 기본: 확인 가능한 품목만 지정 → no-reset (기존 VF 유지)
            do_reset = False
        if do_reset:
            self.stdout.write(
                self.style.WARNING(
                    "--reset: CSV 밖 VF를 해제합니다. "
                    "엑셀 SoT와 불일치하면 865가 깨질 수 있습니다."
                )
            )

        rows = None
        last_err = None
        for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
            try:
                with open(path, "r", encoding=enc, newline="") as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                self.stdout.write(f"CSV 로드: encoding={enc}, rows={len(rows)}")
                break
            except Exception as e:
                last_err = e
                rows = None
        if rows is None:
            raise CommandError(f"CSV 읽기 실패: {last_err}")
        if not rows:
            raise CommandError("CSV 데이터가 비어 있습니다.")

        fieldnames = list(rows[0].keys()) if rows else []
        self.stdout.write(f"컬럼: {fieldnames}")

        def col(*names):
            for n in names:
                for fn in fieldnames:
                    if fn and fn.strip() == n:
                        return fn
            return None

        barcode_col = col("바코드", "상품바코드", "barcode")
        sku_col = col("SKU ID", "SKUID", "SKU번호", "상품번호", "sku_id")
        name_col = col("제품명", "상품명", "SKU명", "product_name")
        date_col = col("등록 일자", "등록일자", "VF등록일", "지정일", "vf_registered_at")
        # 로케이션: '로케이션' 우선, 없으면 신규로케이션+제품번호로 보완
        loc_col = col("로케이션", "location", "적재위치")
        new_loc_col = col("신규로케이션", "신규 로케이션")
        prod_no_col = col("제품번호", "제품 번호")

        # barcode/sku/name → 등록일 (여러 행이면 가장 이른 날짜)
        bc_date: dict[str, date | None] = {}
        sku_date: dict[str, date | None] = {}
        name_date: dict[str, date | None] = {}
        # barcode → location (BarcodeMaster SoT 동기화용)
        bc_location: dict[str, str] = {}
        bc_name: dict[str, str] = {}
        barcodes: set[str] = set()
        skus: set[str] = set()
        names: set[str] = set()
        sku_to_barcode: dict[str, str] = {}
        name_to_barcode: dict[str, str] = {}

        def _keep_earlier(m: dict, key: str, d: date | None):
            if not key:
                return
            prev = m.get(key)
            if d is None:
                m.setdefault(key, None)
            elif prev is None or (isinstance(prev, date) and d < prev):
                m[key] = d

        def _resolve_location(r: dict) -> str:
            """CSV 로케이션 해석. 완전 값 우선, 끝 '-' 이면 신규로케이션 숫자 붙임."""
            loc = _norm(r.get(loc_col, "")) if loc_col else ""
            new_cell = _norm(r.get(new_loc_col, "")) if new_loc_col else ""
            if loc and loc not in ("단종", "-", "nan", "none"):
                if loc.endswith("-") and new_cell.isdigit():
                    return (loc + new_cell)[:255]
                return loc[:255]
            # 신규로케이션만 있고 base 없는 경우는 불완전 → 스킵
            return ""

        for r in rows:
            reg_d = _parse_reg_date(r.get(date_col, "")) if date_col else None
            b = ""
            if barcode_col:
                b = _norm(r.get(barcode_col, ""))
                if b and b.lower() not in ("nan", "none", "-"):
                    barcodes.add(b)
                    _keep_earlier(bc_date, b, reg_d)
                    loc_v = _resolve_location(r)
                    if loc_v:
                        prev_l = bc_location.get(b, "")
                        # 비어 있거나 불완전(끝 '-') 이면 더 완전한 값으로 교체
                        if not prev_l or (
                            prev_l.endswith("-") and not loc_v.endswith("-")
                        ):
                            bc_location[b] = loc_v
                else:
                    b = ""
            s = ""
            if sku_col:
                s = _norm(r.get(sku_col, ""))
                if s and s.lower() not in ("nan", "none", "-"):
                    if s.endswith(".0") and s.replace(".0", "").isdigit():
                        s = s[:-2]
                    skus.add(s)
                    _keep_earlier(sku_date, s, reg_d)
                    if b and s not in sku_to_barcode:
                        sku_to_barcode[s] = b
                else:
                    s = ""
            if name_col:
                n = _norm(r.get(name_col, ""))
                if n and n.lower() not in ("nan", "none", "-"):
                    names.add(n)
                    _keep_earlier(name_date, n, reg_d)
                    if b and n not in name_to_barcode:
                        name_to_barcode[n] = b
                    if b and n:
                        bc_name.setdefault(b, n)

        dates_nonempty = sum(
            1 for d in list(bc_date.values()) + list(sku_date.values()) if d
        )
        self.stdout.write(
            f"CSV 키: barcode={len(barcodes)}, sku={len(skus)}, name={len(names)}, "
            f"등록일자 파싱(키 단위) nonzero≈{dates_nonempty}, "
            f"로케이션 맵={len(bc_location)}"
        )

        # id → (reg_date or None)
        matched: dict[int, date | None] = {}
        by_bc = by_sku = by_name = 0
        barcode_fills: list[tuple[int, str]] = []

        specs = list(
            MasterSpec.objects.all().only(
                "id", "barcode", "sku_id", "product_name", "is_vf_item", "vf_registered_at"
            )
        )
        for s in specs:
            bc = _norm(s.barcode)
            sku = _norm(s.sku_id)
            name = _norm(s.product_name)
            hit_d: date | None = None
            hit = False
            if bc and bc in barcodes:
                hit = True
                by_bc += 1
                hit_d = bc_date.get(bc)
            elif sku and sku in skus:
                hit = True
                by_sku += 1
                hit_d = sku_date.get(sku)
            elif name and name in names:
                hit = True
                by_name += 1
                hit_d = name_date.get(name)
            if hit:
                # 여러 키 모두 있으면 가장 이른 날짜
                cands = []
                if bc and bc in bc_date and bc_date[bc]:
                    cands.append(bc_date[bc])
                if sku and sku in sku_date and sku_date[sku]:
                    cands.append(sku_date[sku])
                if name and name in name_date and name_date[name]:
                    cands.append(name_date[name])
                if cands:
                    hit_d = min(cands)
                matched[s.id] = hit_d
            if not bc:
                fill = (
                    (sku and sku_to_barcode.get(sku))
                    or (name and name_to_barcode.get(name))
                    or ""
                )
                if fill:
                    barcode_fills.append((s.id, fill))

        self.stdout.write(
            f"마스터 매칭: total={len(matched)} (barcode={by_bc}, sku={by_sku}, name={by_name})"
        )
        with_date = sum(1 for d in matched.values() if d)
        self.stdout.write(f"매칭 중 CSV 등록일자 있음: {with_date}개 / 없음: {len(matched) - with_date}개")

        today = timezone.localdate()
        matched_ids = set(matched.keys())

        # CSV 등록일 없는 매칭 품목 → 바코드별 최초 실출고일
        first_out_by_bc = self._first_outbound_by_barcodes(
            {
                _norm(s.barcode)
                for s in specs
                if s.id in matched_ids and _norm(s.barcode)
            }
        )
        no_csv_date_ids = [sid for sid, d in matched.items() if d is None]
        self.stdout.write(
            f"등록일 없음 → 최초 출고일 조회 대상: {len(no_csv_date_ids)}개 "
            f"(출고 맵 바코드 {len(first_out_by_bc)}개)"
        )

        with transaction.atomic():
            if do_reset:
                cleared = (
                    MasterSpec.objects.filter(is_vf_item=True)
                    .exclude(id__in=matched_ids)
                    .update(is_vf_item=False, vf_registered_at=None)
                )
                self.stdout.write(f"VF 플래그 해제(+일자 비움): {cleared}개")

            # 매칭 품목 전부 VF
            was_false = MasterSpec.objects.filter(
                id__in=matched_ids, is_vf_item=False
            ).count()
            MasterSpec.objects.filter(id__in=matched_ids).update(is_vf_item=True)

            # 일자 결정: CSV 등록일 > 최초 출고일 > 오늘
            by_d: dict[date, list[int]] = {}
            used_out = 0
            used_today = 0
            used_csv = 0
            id_to_bc = {
                s.id: _norm(s.barcode) for s in specs if s.id in matched_ids
            }
            for sid, reg_d in matched.items():
                if reg_d:
                    d = reg_d
                    used_csv += 1
                else:
                    bc = id_to_bc.get(sid) or ""
                    out_d = first_out_by_bc.get(bc) if bc else None
                    if out_d:
                        d = out_d
                        used_out += 1
                    else:
                        d = today
                        used_today += 1
                by_d.setdefault(d, []).append(sid)

            set_date = 0
            for d, ids in by_d.items():
                # CSV/출고 기준 일자로 설정. null 이거나 다른 값이면 덮어씀
                # (등록일 없음을 오늘로 넣었던 값도 최초 출고일로 교정)
                n = MasterSpec.objects.filter(id__in=ids).exclude(
                    vf_registered_at=d
                ).update(vf_registered_at=d)
                set_date += n

            self.stdout.write(
                self.style.SUCCESS(
                    f"VF 지정: 매칭 {len(matched_ids)}개 "
                    f"(신규 True {was_false}개, 일자 갱신 {set_date}개 · "
                    f"CSV일 {used_csv} / 최초출고 {used_out} / 오늘폴백 {used_today})"
                )
            )

            filled = 0
            for sid, fill_bc in barcode_fills:
                n = (
                    MasterSpec.objects.filter(id=sid)
                    .filter(Q(barcode="") | Q(barcode__isnull=True))
                    .update(barcode=fill_bc)
                )
                filled += n
            if barcode_fills:
                self.stdout.write(
                    self.style.SUCCESS(f"빈 바코드 보강: {filled}개 (CSV 기준)")
                )

        unmatched_bc = barcodes - {_norm(s.barcode) for s in specs}
        self.stdout.write(f"CSV 바코드 중 미매칭(참고): {len(unmatched_bc)}개")
        vf_with_date = MasterSpec.objects.filter(
            is_vf_item=True, vf_registered_at__isnull=False
        ).count()
        vf_total = MasterSpec.objects.filter(is_vf_item=True).count()
        self.stdout.write(
            f"전체 VF {vf_total}개 (지정일 있음 {vf_with_date}개) · 모드={'reset' if do_reset else 'no-reset(매칭만)'}"
        )

        # 등록일 없는 기존 VF(CSV 밖 포함)도 최초 출고일로 보강
        filled_out = self._backfill_null_dates_from_first_outbound()
        if filled_out:
            self.stdout.write(
                self.style.SUCCESS(
                    f"등록일 없음 → 최초 출고일 보강: {filled_out}개"
                )
            )

        # CSV 로케이션 → BarcodeMaster (목록 표시 SoT). 비어 있지 않은 값만 반영
        loc_stats = self._sync_locations_to_barcode_master(
            bc_location, bc_name=bc_name, sku_to_barcode=sku_to_barcode
        )
        if loc_stats:
            self.stdout.write(
                self.style.SUCCESS(
                    f"로케이션 동기화: 갱신 {loc_stats.get('updated', 0)} · "
                    f"신규 {loc_stats.get('created', 0)} · "
                    f"동일유지 {loc_stats.get('same', 0)} · "
                    f"맵 {loc_stats.get('mapped', 0)}"
                )
            )

    def _sync_locations_to_barcode_master(
        self,
        bc_location: dict[str, str],
        *,
        bc_name: dict[str, str] | None = None,
        sku_to_barcode: dict[str, str] | None = None,
    ) -> dict:
        """
        CSV 로케이션을 BarcodeMaster.location 에 반영.
        MasterSpec 목록의 로케이션 표시는 BarcodeMaster 조인 결과이므로
        VF 동기화 시 함께 등록해야 화면에 보인다.
        """
        if not bc_location:
            return {"mapped": 0, "updated": 0, "created": 0, "same": 0}

        from sales_api.views import _upsert_barcode_location

        bc_name = bc_name or {}
        updated = created = same = 0
        for bc, loc in bc_location.items():
            loc = _norm(loc)
            if not bc or not loc:
                continue
            ok, msg = _upsert_barcode_location(
                bc,
                location=loc,
                product_name=bc_name.get(bc, "") or "",
            )
            if not ok:
                continue
            if msg == "created":
                created += 1
            elif msg == "ok":
                # upsert always returns ok/created — check if actually changed via BM
                updated += 1
            else:
                same += 1
        return {
            "mapped": len(bc_location),
            "updated": updated,
            "created": created,
            "same": same,
        }

    def _first_outbound_by_barcodes(self, barcodes: set[str]) -> dict[str, date]:
        """바코드 → 최초 실출고일 (예측 출고 제외)."""
        if not barcodes:
            return {}
        from django.db.models import Min

        from sales_api.inventory_stock import filter_outbound_for_stock
        from sales_api.models import OutboundRecord

        qs = filter_outbound_for_stock(
            OutboundRecord.objects.filter(barcode__in=list(barcodes)).exclude(
                barcode=""
            )
        )
        out: dict[str, date] = {}
        for row in qs.values("barcode").annotate(first_d=Min("outbound_date")):
            bc = _norm(row.get("barcode"))
            fd = row.get("first_d")
            if bc and fd:
                out[bc] = fd
        return out

    def _backfill_null_dates_from_first_outbound(self) -> int:
        """is_vf_item 이면서 vf_registered_at 없는 행 → 최초 출고일."""
        specs = list(
            MasterSpec.objects.filter(
                is_vf_item=True, vf_registered_at__isnull=True
            )
            .exclude(barcode="")
            .only("id", "barcode")
        )
        if not specs:
            return 0
        first_map = self._first_outbound_by_barcodes(
            {_norm(s.barcode) for s in specs if _norm(s.barcode)}
        )
        by_d: dict[date, list[int]] = {}
        for s in specs:
            bc = _norm(s.barcode)
            d = first_map.get(bc)
            if d:
                by_d.setdefault(d, []).append(s.id)
        n = 0
        for d, ids in by_d.items():
            n += MasterSpec.objects.filter(id__in=ids).update(vf_registered_at=d)
        return n
