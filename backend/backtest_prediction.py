#!/usr/bin/env python
"""
백테스트 스크립트 - 예측 모델 성능 검증
"""
import os
import sys
import django

# Django 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from sales_api.models import OutboundRecord
from django.db.models import Sum, Count, Max
from django.utils import timezone
from datetime import datetime, timedelta
import pandas as pd


def calculate_moving_avg_predict(barcode, date, window_days=14):
    """
    이동 평균을 사용한 간단한 예측
    """
    end_date = date - timedelta(days=1)
    start_date = end_date - timedelta(days=window_days)

    actual = OutboundRecord.objects.filter(
        barcode=barcode,
        outbound_date__gte=start_date,
        outbound_date__lte=end_date
    ).aggregate(total=Sum('box_quantity'))['total'] or 0

    avg_daily = actual / window_days if window_days > 0 else 0
    return int(round(avg_daily))


def run_backtest():
    """
    백테스트 실행
    """
    print("=" * 60)
    print("예측 모델 백테스트")
    print("=" * 60)

    # 테스트 기간 설정: 최근 14일
    latest_date = OutboundRecord.objects.aggregate(d=Max('outbound_date'))['d']
    if not latest_date:
        print("❌ 데이터가 없습니다.")
        return

    test_start = latest_date - timedelta(days=14)
    test_end = latest_date

    print(f"\n📅 테스트 기간: {test_start} ~ {test_end}")
    print(f"📊 최신 데이터: {latest_date}\n")

    # 상위 50개 바코드 추출 (테스트 대상)
    top_barcodes = (
        OutboundRecord.objects
        .filter(outbound_date__gte=latest_date - timedelta(days=30))
        .values('barcode')
        .annotate(total=Sum('box_quantity'))
        .order_by('-total')[:50]
    )

    results = []
    total_mae = 0
    total_mape = 0
    count = 0

    for item in top_barcodes:
        barcode = item['barcode']

        # 각 날짜에 대해 예측 vs 실제 비교
        current_date = test_start
        barcode_mae = 0
        barcode_mape = 0
        barcode_count = 0

        while current_date <= test_end:
            # 예측 (이동 평균)
            predicted = calculate_moving_avg_predict(barcode, current_date)

            # 실제
            actual = OutboundRecord.objects.filter(
                barcode=barcode,
                outbound_date=current_date
            ).aggregate(total=Sum('box_quantity'))['total'] or 0

            # 오차 계산
            if actual > 0 or predicted > 0:
                ae = abs(actual - predicted)
                barcode_mae += ae

                if actual > 0:
                    ape = (ae / actual) * 100
                    barcode_mape += ape
                    barcode_count += 1

            current_date += timedelta(days=1)

        if barcode_count > 0:
            avg_mae = barcode_mae / barcode_count
            avg_mape = barcode_mape / barcode_count

            results.append({
                'barcode': barcode,
                'avg_mae': avg_mae,
                'avg_mape': avg_mape,
                'count': barcode_count
            })

            total_mae += avg_mae
            total_mape += avg_mape
            count += 1

    # 결과 집계
    if count > 0:
        overall_mae = total_mae / count
        overall_mape = total_mape / count

        print("\n" + "=" * 60)
        print("📊 백테스트 결과")
        print("=" * 60)
        print(f"\n전체 평균 절대 오차 (MAE): {overall_mae:.2f} 박스")
        print(f"전체 평균 절대 비율 오차 (MAPE): {overall_mape:.2f}%")
        print(f"테스트 제품 수: {count}")

        # 성능 평가
        if overall_mape <= 15:
            print("\n✅ 우수: MAPE ≤ 15% (프로덕션 적용 권장)")
        elif overall_mape <= 25:
            print("\n⚠️  양호: MAPE ≤ 25% (개선 필요)")
        else:
            print("\n❌ 개선 필요: MAPE > 25%")

        # 상위 10개 제품 상세
        print("\n" + "=" * 60)
        print("🔍 상위 10개 제품 상세")
        print("=" * 60)
        print(f"{'바코드':<15} {'MAE':<10} {'MAPE(%)':<10}")
        print("-" * 40)

        for r in sorted(results, key=lambda x: x['avg_mape'])[:10]:
            print(f"{r['barcode']:<15} {r['avg_mae']:<10.2f} {r['avg_mape']:<10.2f}")

        # 성능 개선 계산 (단순 이동 평균 vs 랜덤/평균)
        print("\n" + "=" * 60)
        print("📈 성능 개선율 분석")
        print("=" * 60)

        # 베이스라인: 전체 평균 사용
        barcode_list = [r['barcode'] for r in results]
        total_actual_all = OutboundRecord.objects.filter(
            outbound_date__gte=test_start,
            outbound_date__lte=test_end,
            barcode__in=barcode_list
        ).aggregate(total=Sum('box_quantity'))['total'] or 0

        total_predicted_all = sum(r['avg_mae'] * r['count'] for r in results)
        baseline_mae = total_actual_all / (count * 14)  # 전체 평균

        improvement = ((baseline_mae - overall_mae) / baseline_mae * 100) if baseline_mae > 0 else 0

        print(f"베이스라인 MAE (전체 평균): {baseline_mae:.2f} 박스")
        print(f"이동 평균 모델 MAE: {overall_mae:.2f} 박스")
        print(f"개선율: {improvement:+.2f}%")

        if improvement >= 15:
            print("\n✅ 15% 이상 개선 - 프로덕션 적용 권장")
        elif improvement > 0:
            print(f"\n✅ 개선됨 ({improvement:.1f}%)")
        else:
            print("\n❌ 개선되지 않음")

    else:
        print("\n❌ 테스트 데이터가 부족합니다.")


if __name__ == '__main__':
    run_backtest()
