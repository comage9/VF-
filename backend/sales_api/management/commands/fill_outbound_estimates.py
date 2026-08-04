"""
출고 실적 공백일 예측 보정 (정밀 버전).

방법 (trend_dow_v2):
  1) 일 합계: 앞 실적일 L ~ 뒤 실적일 R 선형 보간
  2) 요일 보정: 실적 전체(또는 갭 전후 8주) 요일별 평균 / 전체 평균
  3) 품목: L·R 품목 수량도 같은 비율 t 로 선형 보간 (한쪽 없으면 0)
  4) 품목 합이 목표 일합계가 되도록 스케일 → 이전 adjacent_avg 의
     「합집합 풀값」 과대·평탄 문제 완화

  status='예측 보정', is_estimated=True, estimate_method='trend_dow_v2'

사용:
  python manage.py fill_outbound_estimates
  python manage.py fill_outbound_estimates --dry-run
  python manage.py fill_outbound_estimates --clear-only
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.core.management.base import BaseCommand
from django.db.models import Sum

from sales_api.models import OutboundRecord


METHOD = "trend_dow_v2"
STATUS = "예측 보정"
BATCH = 800
DATA_FLOOR = date(2022, 2, 2)
MAX_GAP_DAYS = 400
# 요일 보정 클램프 (과한 주말/평일 왜곡 방지)
DOW_FACTOR_MIN = 0.55
DOW_FACTOR_MAX = 1.40
# 일합계 상한: 앵커 max 대비
DAY_CAP_RATIO = 1.12
DOW_NAMES = ("월", "화", "수", "목", "금", "토", "일")


def _day_product_map(d: date) -> dict[str, dict[str, Any]]:
    rows = (
        OutboundRecord.objects.filter(outbound_date=d, is_estimated=False)
        .values("product_name", "category", "barcode", "client", "purchase_price")
        .annotate(
            box_quantity=Sum("box_quantity"),
            quantity=Sum("quantity"),
            unit_count=Sum("unit_count"),
            sales_amount=Sum("sales_amount"),
        )
    )
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        name = (r.get("product_name") or "").strip()
        if not name:
            continue
        out[name] = {
            "product_name": name,
            "category": (r.get("category") or "").strip() or "미분류",
            "barcode": r.get("barcode"),
            "client": r.get("client") or "",
            "purchase_price": r.get("purchase_price"),
            "box_quantity": int(r.get("box_quantity") or 0),
            "quantity": int(r.get("quantity") or 0) if r.get("quantity") is not None else 0,
            "unit_count": int(r.get("unit_count") or 0)
            if r.get("unit_count") is not None
            else None,
            "sales_amount": Decimal(str(r.get("sales_amount") or 0)),
        }
    return out


def _day_totals(d: date) -> tuple[int, Decimal]:
    agg = OutboundRecord.objects.filter(outbound_date=d, is_estimated=False).aggregate(
        q=Sum("box_quantity"),
        s=Sum("sales_amount"),
    )
    return int(agg["q"] or 0), Decimal(str(agg["s"] or 0))


def _lerp(a: float, b: float, t: float) -> float:
    return (1.0 - t) * float(a) + t * float(b)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _build_dow_profile(
    day_qty: dict[date, int],
    day_sales: dict[date, Decimal],
    window: set[date] | None = None,
) -> tuple[list[float], list[float], float, float]:
    """요일(0=월..6=일)별 평균 박스·매출, 전체 평균."""
    qty_by_dow: list[list[float]] = [[] for _ in range(7)]
    sales_by_dow: list[list[float]] = [[] for _ in range(7)]
    for d, q in day_qty.items():
        if window is not None and d not in window:
            continue
        if q <= 0:
            continue
        wd = d.weekday()
        qty_by_dow[wd].append(float(q))
        sales_by_dow[wd].append(float(day_sales.get(d, 0) or 0))

    qty_avg = [
        (sum(xs) / len(xs)) if xs else 0.0 for xs in qty_by_dow
    ]
    sales_avg = [
        (sum(xs) / len(xs)) if xs else 0.0 for xs in sales_by_dow
    ]
    all_q = [q for xs in qty_by_dow for q in xs]
    all_s = [s for xs in sales_by_dow for s in xs]
    overall_q = (sum(all_q) / len(all_q)) if all_q else 1.0
    overall_s = (sum(all_s) / len(all_s)) if all_s else 1.0
    if overall_q <= 0:
        overall_q = 1.0
    if overall_s <= 0:
        overall_s = 1.0
    return qty_avg, sales_avg, overall_q, overall_s


def _dow_factor(
    d: date,
    qty_avg: list[float],
    overall_q: float,
    local_qty_avg: list[float] | None = None,
    local_overall: float | None = None,
    local_weight: float = 0.55,
) -> float:
    """글로벌 요일 패턴 + (있으면) 갭 전후 로컬 요일 패턴 혼합."""
    wd = d.weekday()
    g = (qty_avg[wd] / overall_q) if overall_q > 0 and qty_avg[wd] > 0 else 1.0
    if local_qty_avg is not None and local_overall and local_overall > 0 and local_qty_avg[wd] > 0:
        loc = local_qty_avg[wd] / local_overall
        f = (1.0 - local_weight) * g + local_weight * loc
    else:
        f = g
    return _clamp(f, DOW_FACTOR_MIN, DOW_FACTOR_MAX)


def _interp_product(
    left: dict | None,
    right: dict | None,
    t: float,
) -> dict[str, Any] | None:
    """품목 수량·매출 선형 보간. 한쪽만 있으면 (1-t) 또는 t 비율만 반영."""
    if not left and not right:
        return None
    src = left or right
    assert src is not None
    qL = float(left["box_quantity"]) if left else 0.0
    qR = float(right["box_quantity"]) if right else 0.0
    sL = float(left["sales_amount"]) if left else 0.0
    sR = float(right["sales_amount"]) if right else 0.0
    nL = float(left.get("quantity") or 0) if left else 0.0
    nR = float(right.get("quantity") or 0) if right else 0.0
    uL = left.get("unit_count") if left else None
    uR = right.get("unit_count") if right else None

    box = _lerp(qL, qR, t)
    sales = _lerp(sL, sR, t)
    qty = _lerp(nL, nR, t)
    if box < 0.4 and sales < 500:
        return None

    unit = None
    if uL is not None or uR is not None:
        unit = int(round(_lerp(float(uL or 0), float(uR or 0), t)))

    return {
        "product_name": src["product_name"],
        "category": (left or src).get("category")
        or (right or src).get("category")
        or "미분류",
        "barcode": (left or {}).get("barcode") or (right or {}).get("barcode"),
        "client": (left or {}).get("client") or (right or {}).get("client") or "",
        "purchase_price": (left or {}).get("purchase_price")
        if left and left.get("purchase_price") not in (None, 0)
        else (right or {}).get("purchase_price"),
        "box_quantity": box,
        "quantity": qty,
        "unit_count": unit,
        "sales_amount": sales,
    }


def _scale_day_products(
    products: list[dict[str, Any]],
    target_box: float,
    target_sales: float,
) -> list[dict[str, Any]]:
    """품목 합 → 목표 일합계로 스케일 후 정수화 + 잔차로 목표 맞춤."""
    if not products:
        return []
    sum_box = sum(float(p["box_quantity"]) for p in products)
    sum_sales = sum(float(p["sales_amount"]) for p in products)
    if sum_box <= 0 and sum_sales <= 0:
        return []

    target_bi = max(0, int(round(target_box)))
    scale_q = (target_box / sum_box) if sum_box > 0 else 0.0
    scale_s = (target_sales / sum_sales) if sum_sales > 0 else scale_q

    out: list[dict[str, Any]] = []
    for p in products:
        b = float(p["box_quantity"]) * scale_q
        s = float(p["sales_amount"]) * scale_s
        n = float(p.get("quantity") or 0) * scale_q
        # 반올림 부풀림 완화: 0.5 미만은 버림
        bi = int(b + 0.35) if b > 0 else 0
        if bi <= 0 and s < 1000:
            continue
        if bi <= 0:
            bi = 1
        out.append(
            {
                **p,
                "box_quantity": bi,
                "quantity": max(0, int(n + 0.35)),
                "sales_amount": Decimal(str(round(s, 2))),
            }
        )

    if not out:
        return []

    # 잔차 보정: 합이 목표 박스와 같게
    cur = sum(p["box_quantity"] for p in out)
    diff = target_bi - cur
    if diff != 0:
        # 큰 품목 순으로 ±1 조정
        ranked = sorted(out, key=lambda x: x["box_quantity"], reverse=True)
        i = 0
        guard = 0
        while diff != 0 and ranked and guard < 5000:
            p = ranked[i % len(ranked)]
            if diff > 0:
                p["box_quantity"] += 1
                diff -= 1
            else:
                if p["box_quantity"] > 1:
                    p["box_quantity"] -= 1
                    diff += 1
            i += 1
            guard += 1

    # 매출도 박스 비율에 가깝게 재스케일
    sum_s = sum(float(p["sales_amount"]) for p in out)
    if sum_s > 0 and target_sales > 0:
        sf = target_sales / sum_s
        for p in out:
            p["sales_amount"] = Decimal(str(round(float(p["sales_amount"]) * sf, 2)))

    return out


class Command(BaseCommand):
    help = "공백 출고일을 선형추세+요일패턴으로 예측 보정 재생성"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--clear-only", action="store_true")
        parser.add_argument("--start", type=str, default="")
        parser.add_argument("--end", type=str, default="")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        clear_only = options["clear_only"]

        existing_est = OutboundRecord.objects.filter(is_estimated=True).count()
        self.stdout.write(f"기존 예측 보정 행: {existing_est:,}")

        if clear_only:
            if dry:
                self.stdout.write(self.style.WARNING(f"[dry-run] 삭제 예정 {existing_est:,}"))
                return
            deleted, _ = OutboundRecord.objects.filter(is_estimated=True).delete()
            self.stdout.write(self.style.SUCCESS(f"예측 보정 삭제: {deleted:,}"))
            return

        if not dry:
            deleted, _ = OutboundRecord.objects.filter(is_estimated=True).delete()
            self.stdout.write(f"기존 예측 삭제: {deleted:,}")

        floor = DATA_FLOOR
        if options["start"]:
            try:
                s = date.fromisoformat(options["start"])
                if s > floor:
                    floor = s
            except ValueError:
                pass
        end_cap = None
        if options["end"]:
            try:
                end_cap = date.fromisoformat(options["end"])
            except ValueError:
                end_cap = None

        real_qs = OutboundRecord.objects.filter(
            is_estimated=False,
            outbound_date__gte=floor,
            outbound_date__year__gte=2022,
            outbound_date__year__lte=2100,
        )
        if end_cap:
            real_qs = real_qs.filter(outbound_date__lte=end_cap)

        real_days = sorted(real_qs.values_list("outbound_date", flat=True).distinct())
        if len(real_days) < 2:
            self.stdout.write(self.style.WARNING("실적일이 2일 미만 — 보간 불가"))
            return

        self.stdout.write(
            f"실적 앵커일: {len(real_days)}일 ({real_days[0]} ~ {real_days[-1]})"
        )
        self.stdout.write(f"방법: {METHOD} (선형추세 + 요일 보정 + 일합계 스케일)")

        # 일별 합계 캐시 + 글로벌 요일 프로파일
        day_qty: dict[date, int] = {}
        day_sales: dict[date, Decimal] = {}
        for d in real_days:
            q, s = _day_totals(d)
            day_qty[d] = q
            day_sales[d] = s

        g_qty_avg, g_sales_avg, g_overall_q, g_overall_s = _build_dow_profile(
            day_qty, day_sales
        )
        self.stdout.write("요일별 평균 박스 (전체 실적):")
        for i, name in enumerate(DOW_NAMES):
            fac = (g_qty_avg[i] / g_overall_q) if g_overall_q else 1.0
            self.stdout.write(
                f"  {name}: {g_qty_avg[i]:.0f} (배율 {fac:.2f})"
            )

        gaps: list[tuple[date, date, list[date]]] = []
        total_missing = 0
        for i in range(len(real_days) - 1):
            left_d, right_d = real_days[i], real_days[i + 1]
            gap = (right_d - left_d).days - 1
            if gap <= 0:
                continue
            if gap > MAX_GAP_DAYS * 10:
                self.stdout.write(
                    self.style.WARNING(f"  skip 비정상 갭 {left_d}~{right_d} ({gap}일)")
                )
                continue
            missing = [left_d + timedelta(days=k) for k in range(1, gap + 1)]
            gaps.append((left_d, right_d, missing))
            total_missing += len(missing)

        self.stdout.write(f"공백 구간: {len(gaps)}곳, 빠진 일수: {total_missing}")

        cache: dict[date, dict[str, dict]] = {}

        def get_map(d: date) -> dict[str, dict]:
            if d not in cache:
                cache[d] = _day_product_map(d)
            return cache[d]

        to_create: list[OutboundRecord] = []
        created = 0
        gap_report: list[str] = []
        sample_day_totals: list[str] = []

        for left_d, right_d, missing in gaps:
            left_map = get_map(left_d)
            right_map = get_map(right_d)
            products = set(left_map.keys()) | set(right_map.keys())
            Lq = float(day_qty.get(left_d, 0))
            Rq = float(day_qty.get(right_d, 0))
            Ls = float(day_sales.get(left_d, 0) or 0)
            Rs = float(day_sales.get(right_d, 0) or 0)
            span = (right_d - left_d).days  # >= 2

            # 갭 전후 8주 로컬 요일 패턴
            win_start = left_d - timedelta(days=56)
            win_end = right_d + timedelta(days=56)
            local_window = {
                d
                for d in day_qty
                if win_start <= d <= win_end and d not in missing
            }
            loc_q_avg, _, loc_overall_q, _ = _build_dow_profile(
                day_qty, day_sales, local_window if len(local_window) >= 7 else None
            )
            use_local = len(local_window) >= 14

            gap_report.append(
                f"  {missing[0]}~{missing[-1]} ({len(missing)}일) "
                f"L={left_d}({Lq:.0f}box,{len(left_map)}p) "
                f"R={right_d}({Rq:.0f}box,{len(right_map)}p)"
            )

            for d in missing:
                t = (d - left_d).days / float(span)
                t = _clamp(t, 0.0, 1.0)

                base_q = _lerp(Lq, Rq, t)
                base_s = _lerp(Ls, Rs, t)
                fac = _dow_factor(
                    d,
                    g_qty_avg,
                    g_overall_q,
                    loc_q_avg if use_local else None,
                    loc_overall_q if use_local else None,
                )
                target_q = base_q * fac
                target_s = base_s * fac
                # 앵커 대비 상한
                cap = max(Lq, Rq, 1.0) * DAY_CAP_RATIO
                if target_q > cap:
                    scale_cap = cap / target_q
                    target_q *= scale_cap
                    target_s *= scale_cap

                raw_list: list[dict[str, Any]] = []
                for name in products:
                    row = _interp_product(left_map.get(name), right_map.get(name), t)
                    if row:
                        raw_list.append(row)

                scaled = _scale_day_products(raw_list, target_q, target_s)
                if not scaled:
                    continue

                if d in (date(2025, 7, 19), date(2025, 7, 20), date(2025, 8, 1), date(2025, 11, 30)):
                    sample_day_totals.append(
                        f"  {d}({DOW_NAMES[d.weekday()]}) "
                        f"t={t:.2f} fac={fac:.2f} "
                        f"target_box={target_q:.0f} products={len(scaled)} "
                        f"sum_box={sum(p['box_quantity'] for p in scaled)}"
                    )

                if dry:
                    created += len(scaled)
                    continue

                for p in scaled:
                    to_create.append(
                        OutboundRecord(
                            outbound_date=d,
                            product_name=p["product_name"],
                            category=p["category"],
                            barcode=p.get("barcode"),
                            client=p.get("client") or "",
                            purchase_price=p.get("purchase_price"),
                            box_quantity=p["box_quantity"],
                            quantity=p.get("quantity") or 0,
                            unit_count=p.get("unit_count"),
                            sales_amount=p["sales_amount"],
                            status=STATUS,
                            notes=(
                                f"예측 보정|{METHOD}|L={left_d}|R={right_d}"
                                f"|t={t:.3f}|dow={fac:.3f}"
                            ),
                            is_estimated=True,
                            estimate_method=METHOD,
                        )
                    )
                    if len(to_create) >= BATCH:
                        OutboundRecord.objects.bulk_create(to_create, batch_size=BATCH)
                        created += len(to_create)
                        to_create = []
                        self.stdout.write(f"  … {created:,} rows")

        if to_create and not dry:
            OutboundRecord.objects.bulk_create(to_create, batch_size=BATCH)
            created += len(to_create)

        for line in gap_report[:25]:
            self.stdout.write(line)
        if len(gap_report) > 25:
            self.stdout.write(f"  … 외 {len(gap_report) - 25} 구간")
        if sample_day_totals:
            self.stdout.write("샘플 일합계:")
            for line in sample_day_totals:
                self.stdout.write(line)

        if dry:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] 생성 예정 약 {created:,}행 / 빠진 일 {total_missing}일"
                )
            )
        else:
            final = OutboundRecord.objects.filter(is_estimated=True).count()
            self.stdout.write(
                self.style.SUCCESS(
                    f"완료: 예측 보정 {final:,}행 (방법 {METHOD}, 생성 {created:,})"
                )
            )
            for sample in (
                date(2025, 7, 18),
                date(2025, 7, 19),
                date(2025, 7, 20),
                date(2025, 7, 21),
                date(2025, 8, 1),
                date(2025, 11, 10),
                date(2025, 11, 30),
                date(2025, 12, 2),
            ):
                rn = OutboundRecord.objects.filter(
                    outbound_date=sample, is_estimated=False
                ).count()
                en = OutboundRecord.objects.filter(
                    outbound_date=sample, is_estimated=True
                ).count()
                rq = (
                    OutboundRecord.objects.filter(
                        outbound_date=sample, is_estimated=False
                    ).aggregate(q=Sum("box_quantity"))["q"]
                    or 0
                )
                eq = (
                    OutboundRecord.objects.filter(
                        outbound_date=sample, is_estimated=True
                    ).aggregate(q=Sum("box_quantity"))["q"]
                    or 0
                )
                tag = "실적" if rn else "예측"
                self.stdout.write(
                    f"  검증 {sample}({DOW_NAMES[sample.weekday()]}): "
                    f"{tag} 박스={rq or eq}, 품목={rn or en}"
                )
