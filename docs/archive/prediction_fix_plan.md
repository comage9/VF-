# 예측 로직 수정 계획 (Prediction Logic Fix Plan)

## 1. 현상 및 원인 분석
- **현상:** 특정 시간대(예: 16시)에 대량의 출고 데이터가 일시에 업로드(Spike)될 경우, 이후 시간대의 예측값이 비정상적으로 높게 산출됨.
- **원인:**
  - 현재 로직(`calculateTrendMultiplier`)은 **"현재 누적값 / 평소 동시간대 평균 누적값"** 비율을 그대로 추세(Trend)로 사용함.
  - 16시에 1,000개가 한 번에 찍히면, 평소 500개 하던 시간대 대비 2배의 실적을 낸 것으로 인식.
  - 시스템은 "오늘 작업 속도가 평소의 2배다"라고 판단하여, 남은 시간(17시~23시)의 예상 증가분도 모두 2배로 뻥튀기함.

## 2. 해결 방안: 추세 계산 방식 변경 (누적 비율 ➔ 구간 속도)
단순히 "지금까지 많이 했으니 앞으로도 많이 할 것이다"라는 전제를 수정해야 함.
순간적인 폭증(Spike)은 일시적인 이벤트일 가능성이 높으므로, **"최근 작업 속도"**를 더 안정적인 지표로 삼아야 함.

### 변경 전 (Current Logic)
```javascript
// 현재값(누적) / 평균값(누적) = 단순 비율
const trendMultiplier = avgCurrentHour > 0 ? currentValue / avgCurrentHour : 1.0;
// 범위 제한: 0.5 ~ 2.0 (최대 2배까지만 인정)
return Math.max(0.5, Math.min(trendMultiplier, 2.0));
```

### 변경 후 (Proposed Logic)
**"최근 3시간 동안의 증가량"**을 평소와 비교하여 추세를 판단하되, **중간값(Median)**을 사용하여 일시적 폭증(Spike)을 무시함.

1.  **최근 3시간의 시간당 증가량(Velocity) 추출:**
    - 예: 14시(+50), 15시(+60), 16시(+1000)
2.  **평소 동시간대의 시간당 증가량 추출:**
    - 예: 14시(+45), 15시(+55), 16시(+50)
3.  **비율 계산 (Ratio):**
    - 14시: 1.1배, 15시: 1.09배, 16시: 20배
4.  **중간값(Median) 선택:**
    - [1.1, 1.09, 20] 중 중간값 ➔ **1.1**
    - 16시의 20배 폭증은 무시되고, 1.1배라는 안정적인 추세만 남음.

## 3. 상세 구현 계획 (frontend/client/public/js/dashboard.js)

`calculateTrendMultiplier` 메서드를 다음과 같이 전면 수정:

```javascript
calculateTrendMultiplier(currentHour, currentValue, sameDayData) {
    // 1. 데이터가 너무 적거나(초기), 3시간 미만이면 기존 방식(누적 비율) 사용 (안전장치)
    if (currentHour < 3 || sameDayData.length < 5) {
        // ...기존 로직 유지...
        return Math.max(0.8, Math.min(ratio, 1.2)); // 대신 범위를 0.8~1.2로 축소하여 안전하게
    }

    // 2. 최근 3시간의 "구간 증가량 비율" 계산
    const ratios = [];
    const lookback = 3; 

    for (let i = 0; i < lookback; i++) {
        const targetH = currentHour - i;
        const prevH = targetH - 1;
        
        // 현재 데이터의 구간 증가량
        const currInc = this.getHourlyIncrement(this.getCurrentDayData(), targetH);
        
        // 과거 데이터들의 평균 구간 증가량
        const avgInc = this.getAverageHourlyIncrement(sameDayData, targetH);

        if (avgInc > 10) { // 의미 있는 물량일 때만 비율 계산
             ratios.push(currInc / avgInc);
        }
    }

    if (ratios.length === 0) return 1.0;

    // 3. 중간값(Median) 선택 ➔ Spike 제거 핵심 로직
    ratios.sort((a, b) => a - b);
    const medianRatio = ratios[Math.floor(ratios.length / 2)];

    // 4. 안전 범위 적용 (0.8 ~ 1.5)
    // 아무리 빨라도 평소의 1.5배 이상으로 예측하지 않도록 제한
    return Math.max(0.8, Math.min(medianRatio, 1.5));
}
```

## 4. 기대 효과
- 16시에 엑셀 업로드로 데이터가 급증해도, 추세(Multiplier)는 2.0이 아닌 1.0~1.1 수준으로 유지됨.
- 따라서 남은 시간(17~23시)의 예측값은 평소와 비슷하게 완만하게 증가함.
- "데이터 올렸더니 예측 그래프가 하늘을 뚫는다"는 문제 해결.
