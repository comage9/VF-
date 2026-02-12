"""
시간별 예측 모델 백테스트 Django Management Command

사용법:
    python manage.py backtest_prediction
"""

from django.core.management.base import BaseCommand
from datetime import datetime
import statistics
from collections import defaultdict
from sales_api.models import DeliveryDailyRecord


class PredictionModel:
    """예측 모델 베이스 클래스"""
    
    def __init__(self, name):
        self.name = name
    
    def predict(self, current_hour, current_value, day_of_week, past_data):
        """
        current_hour: 현재 시간 (0-22)
        current_value: 현재까지의 누적값
        day_of_week: 요일 (0=일요일, 6=토요일)
        past_data: 과거 DeliveryDailyRecord 리스트
        
        Returns: 23시 예측값
        """
        raise NotImplementedError


class CurrentSimpleModel(PredictionModel):
    """현재 백엔드 모델: 남은 시간 * 10"""
    
    def predict(self, current_hour, current_value, day_of_week, past_data):
        remaining_hours = max(0, 23 - current_hour)
        predicted_total = current_value + (remaining_hours * 10)
        return predicted_total


class ImprovedMedianModel(PredictionModel):
    """개선 모델 1: 같은 요일 과거 데이터 중간값"""
    
    def predict(self, current_hour, current_value, day_of_week, past_data):
        increments = []
        
        # 같은 요일 데이터만 필터링
        same_day_records = [r for r in past_data 
                           if datetime.strptime(r.date.isoformat(), '%Y-%m-%d').weekday() == (day_of_week - 1) % 7]
        
        if len(same_day_records) < 3:
            same_day_records = past_data  # 데이터 부족 시 전체 사용
        
        for record in same_day_records:
            hourly = record.hourly or {}
            current_hour_key = f'hour_{current_hour:02d}'
            current_hour_value = int(hourly.get(current_hour_key, 0))
            final_value = int(record.total or 0)
            
            if current_hour_value > 0 and final_value > current_hour_value:
                increment = final_value - current_hour_value
                increments.append(increment)
        
        if not increments:
            # 데이터 없으면 요일별 기본값
            day_base = {0: 50, 1: 80, 2: 40, 3: 80, 4: 80, 5: 70, 6: 100}
            increment = day_base.get(day_of_week, 60)
            return current_value + increment
        
        # 이상치 제거 (상위 10%, 하위 10%)
        increments.sort()
        if len(increments) > 10:
            trim_count = len(increments) // 10
            increments = increments[trim_count:-trim_count]
        
        median_increment = statistics.median(increments)
        return current_value + int(median_increment)


class ImprovedWeightedModel(PredictionModel):
    """개선 모델 2: 시간대별 가중치 + 중간값"""
    
    def predict(self, current_hour, current_value, day_of_week, past_data):
        increments = []
        
        # 같은 요일 데이터만 필터링
        same_day_records = [r for r in past_data 
                           if datetime.strptime(r.date.isoformat(), '%Y-%m-%d').weekday() == (day_of_week - 1) % 7]
        
        if len(same_day_records) < 3:
            same_day_records = past_data
        
        # 최근 데이터에 가중치 부여
        today = datetime.now().date()
        for record in same_day_records:
            hourly = record.hourly or {}
            current_hour_key = f'hour_{current_hour:02d}'
            current_hour_value = int(hourly.get(current_hour_key, 0))
            final_value = int(record.total or 0)
            
            if current_hour_value > 0 and final_value > current_hour_value:
                increment = final_value - current_hour_value
                
                # 최근 3주 이내 데이터는 1.5배 가중
                days_diff = (today - record.date).days
                if days_diff <= 21:
                    increments.append(increment)
                    increments.append(increment)  # 2배 효과
                else:
                    increments.append(increment)
        
        if not increments:
            day_base = {0: 50, 1: 80, 2: 40, 3: 80, 4: 80, 5: 70, 6: 100}
            increment = day_base.get(day_of_week, 60)
            return current_value + increment
        
        # 이상치 제거
        increments.sort()
        if len(increments) > 10:
            trim_count = len(increments) // 10
            increments = increments[trim_count:-trim_count]
        
        # 시간대별 가중치
        hour_weights = {
            range(9, 12): 1.1,   # 오전
            range(12, 14): 1.3,  # 점심
            range(14, 18): 1.2,  # 오후
            range(18, 24): 0.9   # 저녁
        }
        
        weight = 1.0
        for hour_range, w in hour_weights.items():
            if current_hour in hour_range:
                weight = w
                break
        
        median_increment = statistics.median(increments) * weight
        return current_value + int(median_increment)


class ImprovedEnsembleModel(PredictionModel):
    """개선 모델 3: 앙상블 (중간값 + 평균 + Q3)"""
    
    def predict(self, current_hour, current_value, day_of_week, past_data):
        increments = []
        
        # 같은 요일 데이터
        same_day_records = [r for r in past_data 
                           if datetime.strptime(r.date.isoformat(), '%Y-%m-%d').weekday() == (day_of_week - 1) % 7]
        
        if len(same_day_records) < 3:
            same_day_records = past_data
        
        today = datetime.now().date()
        for record in same_day_records:
            hourly = record.hourly or {}
            current_hour_key = f'hour_{current_hour:02d}'
            current_hour_value = int(hourly.get(current_hour_key, 0))
            final_value = int(record.total or 0)
            
            if current_hour_value > 0 and final_value > current_hour_value:
                increment = final_value - current_hour_value
                
                # 최근 데이터 가중
                days_diff = (today - record.date).days
                if days_diff <= 21:
                    increments.extend([increment] * 2)
                else:
                    increments.append(increment)
        
        if not increments:
            day_base = {0: 50, 1: 80, 2: 40, 3: 80, 4: 80, 5: 70, 6: 100}
            increment = day_base.get(day_of_week, 60)
            return current_value + increment
        
        # 이상치 제거
        increments.sort()
        if len(increments) > 10:
            trim_count = len(increments) // 10
            increments = increments[trim_count:-trim_count]
        
        # 앙상블: 중간값 50%, 평균 30%, Q3 20%
        median_val = statistics.median(increments)
        mean_val = statistics.mean(increments)
        q3_index = int(len(increments) * 0.75)
        q3_val = increments[q3_index] if q3_index < len(increments) else increments[-1]
        
        ensemble_increment = (median_val * 0.5) + (mean_val * 0.3) + (q3_val * 0.2)
        
        # 시간대별 가중치
        hour_weights = {
            range(9, 12): 1.1,
            range(12, 14): 1.3,
            range(14, 18): 1.2,
            range(18, 24): 0.9
        }
        
        weight = 1.0
        for hour_range, w in hour_weights.items():
            if current_hour in hour_range:
                weight = w
                break
        
        final_increment = ensemble_increment * weight
        return current_value + int(final_increment)


class Command(BaseCommand):
    help = '시간별 예측 모델 백테스트 실행'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--train-ratio',
            type=float,
            default=0.8,
            help='Train/Test 분할 비율 (기본: 0.8)'
        )
        parser.add_argument(
            '--test-hours',
            type=str,
            default='10,12,14,16,18',
            help='테스트할 시간대 (쉼표로 구분, 기본: 10,12,14,16,18)'
        )
    
    def handle(self, *args, **options):
        train_ratio = options['train_ratio']
        test_hours = [int(h) for h in options['test_hours'].split(',')]
        
        self.stdout.write("=" * 80)
        self.stdout.write("시간별 예측 모델 백테스트 시작")
        self.stdout.write("=" * 80)
        
        # 모든 데이터 로드
        all_records = list(DeliveryDailyRecord.objects.all().order_by('date'))
        
        if len(all_records) < 10:
            self.stdout.write(self.style.WARNING("⚠️ 데이터가 충분하지 않습니다 (최소 10개 필요)"))
            return
        
        # Train/Test 분할
        split_idx = int(len(all_records) * train_ratio)
        train_data = all_records[:split_idx]
        test_data = all_records[split_idx:]
        
        self.stdout.write(f"\n📊 데이터 분할:")
        self.stdout.write(f"  - 전체: {len(all_records)}개")
        self.stdout.write(f"  - 학습: {len(train_data)}개 ({train_data[0].date} ~ {train_data[-1].date})")
        self.stdout.write(f"  - 테스트: {len(test_data)}개 ({test_data[0].date} ~ {test_data[-1].date})")
        self.stdout.write(f"  - 테스트 시간대: {test_hours}시")
        
        # 모델 초기화
        models = [
            CurrentSimpleModel("현재 모델 (시간당 +10)"),
            ImprovedMedianModel("개선 모델 1 (같은 요일 중간값)"),
            ImprovedWeightedModel("개선 모델 2 (시간대 가중치)"),
            ImprovedEnsembleModel("개선 모델 3 (앙상블)")
        ]
        
        # 각 모델별 결과 저장
        results = {model.name: defaultdict(list) for model in models}
        
        # 테스트 데이터에 대해 예측 수행
        test_count = 0
        for test_record in test_data:
            hourly = test_record.hourly or {}
            actual_final = int(test_record.total or 0)
            
            if actual_final == 0:
                continue  # 데이터 없는 날 스킵
            
            day_of_week = datetime.strptime(test_record.date.isoformat(), '%Y-%m-%d').weekday()
            day_of_week = (day_of_week + 1) % 7  # 0=일요일로 변환
            
            for test_hour in test_hours:
                current_hour_key = f'hour_{test_hour:02d}'
                current_value = int(hourly.get(current_hour_key, 0))
                
                if current_value == 0 or current_value >= actual_final:
                    continue  # 유효하지 않은 데이터
                
                # 각 모델로 예측
                for model in models:
                    predicted = model.predict(test_hour, current_value, day_of_week, train_data)
                    error = abs(predicted - actual_final)
                    pct_error = (error / actual_final) * 100 if actual_final > 0 else 0
                    
                    results[model.name][test_hour].append({
                        'date': test_record.date,
                        'actual': actual_final,
                        'predicted': predicted,
                        'current': current_value,
                        'error': error,
                        'pct_error': pct_error
                    })
                
                test_count += 1
        
        if test_count == 0:
            self.stdout.write(self.style.WARNING("\n⚠️ 유효한 테스트 케이스가 없습니다"))
            return
        
        self.stdout.write(self.style.SUCCESS(f"\n✅ 총 {test_count}개 테스트 케이스 완료\n"))
        
        # 결과 출력
        self._print_results(results)
        
        # 최고 성능 모델 선정
        self._select_best_model(results)
    
    def _print_results(self, results):
        """결과 출력"""
        self.stdout.write("=" * 80)
        self.stdout.write("백테스트 결과")
        self.stdout.write("=" * 80)
        
        for model_name in results.keys():
            self.stdout.write(f"\n📌 {model_name}")
            self.stdout.write("-" * 80)
            
            all_errors = []
            all_pct_errors = []
            
            for test_hour in sorted(results[model_name].keys()):
                hour_results = results[model_name][test_hour]
                
                if not hour_results:
                    continue
                
                errors = [r['error'] for r in hour_results]
                pct_errors = [r['pct_error'] for r in hour_results]
                
                mae = statistics.mean(errors)
                mape = statistics.mean(pct_errors)
                rmse = (statistics.mean([e**2 for e in errors])) ** 0.5
                
                all_errors.extend(errors)
                all_pct_errors.extend(pct_errors)
                
                self.stdout.write(f"  [{test_hour:02d}시 기준] "
                                f"MAE: {mae:6.1f} | "
                                f"MAPE: {mape:5.1f}% | "
                                f"RMSE: {rmse:6.1f} "
                                f"(n={len(hour_results)})")
            
            if all_errors:
                overall_mae = statistics.mean(all_errors)
                overall_mape = statistics.mean(all_pct_errors)
                overall_rmse = (statistics.mean([e**2 for e in all_errors])) ** 0.5
                
                self.stdout.write(f"\n  [전체 평균] "
                                f"MAE: {overall_mae:6.1f} | "
                                f"MAPE: {overall_mape:5.1f}% | "
                                f"RMSE: {overall_rmse:6.1f}")
    
    def _select_best_model(self, results):
        """최고 성능 모델 선정"""
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("모델 성능 비교")
        self.stdout.write("=" * 80)
        
        model_scores = []
        
        for model_name in results.keys():
            all_errors = []
            all_pct_errors = []
            
            for hour_results in results[model_name].values():
                all_errors.extend([r['error'] for r in hour_results])
                all_pct_errors.extend([r['pct_error'] for r in hour_results])
            
            if not all_errors:
                continue
            
            mae = statistics.mean(all_errors)
            mape = statistics.mean(all_pct_errors)
            rmse = (statistics.mean([e**2 for e in all_errors])) ** 0.5
            
            model_scores.append({
                'name': model_name,
                'mae': mae,
                'mape': mape,
                'rmse': rmse
            })
        
        # MAE 기준 정렬
        model_scores.sort(key=lambda x: x['mae'])
        
        self.stdout.write("\n순위 | 모델명                          | MAE    | MAPE   | RMSE")
        self.stdout.write("-" * 80)
        
        for idx, score in enumerate(model_scores, 1):
            emoji = "🥇" if idx == 1 else "🥈" if idx == 2 else "🥉" if idx == 3 else "  "
            self.stdout.write(f" {emoji} {idx} | {score['name']:<30} | "
                            f"{score['mae']:6.1f} | {score['mape']:5.1f}% | {score['rmse']:6.1f}")
        
        # 개선율 계산
        if len(model_scores) >= 2:
            baseline = next((s for s in model_scores if '현재' in s['name']), model_scores[-1])
            best = model_scores[0]
            
            improvement = ((baseline['mae'] - best['mae']) / baseline['mae']) * 100
            
            self.stdout.write("\n" + "=" * 80)
            self.stdout.write("개선 효과")
            self.stdout.write("=" * 80)
            self.stdout.write(f"  기준 모델: {baseline['name']}")
            self.stdout.write(f"  최고 모델: {best['name']}")
            self.stdout.write(f"  MAE 개선율: {improvement:.1f}%")
            
            if improvement > 15:
                self.stdout.write(self.style.SUCCESS(f"\n  ✅ 목표 달성! ({improvement:.1f}% > 15%)"))
                self.stdout.write(self.style.SUCCESS(f"  권장: '{best['name']}' 모델을 프로덕션에 적용하세요."))
            else:
                self.stdout.write(self.style.WARNING(f"\n  ⚠️ 목표 미달 ({improvement:.1f}% < 15%)"))
                self.stdout.write(self.style.WARNING(f"  권장: 추가 모델 개선이 필요합니다."))
