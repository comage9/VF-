
// Mocking the helper function logic from dashboard.js
function calculateLinearIncrement(currentHour, currentValue, sameDayData) {
    // Spike 방지: 현재값(currentValue)을 사용하지 않고, 과거 데이터의 "구간 평균 증가량"을 사용
    const increments = [];
    const remainingHours = 23 - currentHour;

    if (remainingHours <= 0) return 0;

    sameDayData.forEach(row => {
        const baseVal = parseInt(row[`hour_${String(currentHour).padStart(2, '0')}`]) || 0;
        const finalVal = parseInt(row.hour_23) || 0;

        if (finalVal > baseVal) {
            const diff = finalVal - baseVal;
            increments.push(diff / remainingHours);
        }
    });

    if (increments.length === 0) return 40; // 기본값

    increments.sort((a, b) => a - b);
    const medianIncrement = increments[Math.floor(increments.length / 2)];

    console.log(`📏 선형 증가량 (Median): ${medianIncrement.toFixed(1)} (Based on historical data only)`);

    return medianIncrement;
}

// --- Test Case ---

// 1. Setup Mock Data
const currentHour = 16;
const currentValue = 4000; // SPIKE! (Normal would be ~300)

// Past data (Normal patterns)
// Suppose normally at 16:00 it's 300, and at 23:00 it's 500.
// Growth = 200 over 7 hours => ~28.5 per hour.
const sameDayData = [
    { hour_16: 280, hour_23: 480 }, // +200 / 7 = 28.5
    { hour_16: 300, hour_23: 500 }, // +200 / 7 = 28.5
    { hour_16: 320, hour_23: 520 }, // +200 / 7 = 28.5
    { hour_16: 290, hour_23: 490 }, // +200 / 7 = 28.5
    { hour_16: 310, hour_23: 510 }  // +200 / 7 = 28.5
];

console.log("Testing calculateLinearIncrement with Spike...");
console.log(`Current Hour: ${currentHour}`);
console.log(`Current Value (Spike): ${currentValue}`);
console.log(`Historical Data: Normal growth (~28.5/hr)`);

// 2. Run Function
const result = calculateLinearIncrement(currentHour, currentValue, sameDayData);

// 3. Verify
console.log(`\nResult: ${result.toFixed(2)}`);

if (result < 50) {
    console.log("✅ PASS: Result is within normal range, ignoring the spike.");
} else {
    console.log("❌ FAIL: Result is too high, spike influenced the prediction.");
}
