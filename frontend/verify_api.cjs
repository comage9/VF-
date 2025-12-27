
async function getFetch() {
    if (typeof global.fetch === 'function') return global.fetch;
    const mod = await import('node-fetch');
    return mod.default;
}

async function verifyApi() {
    const fetch = await getFetch();
    const currentHour = 16;
    const currentTotal = 4000; // Spike

    // 1. Simulate Frontend Calculation (Robust)
    // Assuming normal growth is ~28.6 per hour
    const remainingHours = 23 - currentHour; // 7 hours
    const increment = 28.6;
    const predictedIncrement = Math.round(increment * remainingHours);
    const robustPrediction = currentTotal + predictedIncrement; // 4000 + 200 = 4200

    const basePredictions = {
        hour_23: robustPrediction
    };

    console.log(`[Client Simulation] Calculated Robust Prediction: ${robustPrediction}`);

    // 2. Send Request to API
    const url = 'http://localhost:5174/api/ai/predict-hourly';
    const payload = {
        currentHour: currentHour,
        currentData: { total: currentTotal },
        basePredictions: basePredictions
    };

    console.log(`[Client Simulation] Sending request to ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log('---------------------------------------------------');
        console.log('[API Response]', JSON.stringify(data, null, 2));
        console.log('---------------------------------------------------');

        const apiPrediction = data.predictions.hour_23;
        const naivePrediction = Math.round(currentTotal * 1.1) + 100; // 4500

        console.log(`Current Total (16:00): ${currentTotal}`);
        console.log(`Naive Prediction (Old Logic): ${naivePrediction}`);
        console.log(`Robust Prediction (Frontend): ${robustPrediction}`);
        console.log(`API Returned Prediction: ${apiPrediction}`);

        if (Math.abs(apiPrediction - robustPrediction) < 50) {
            console.log(`✅ VERIFICATION SUCCESS: API used the robust prediction (${apiPrediction}).`);
        } else if (Math.abs(apiPrediction - naivePrediction) < 50) {
            console.log(`❌ VERIFICATION FAILED: API used the naive logic (${apiPrediction}).`);
        } else {
            console.log(`⚠️ VERIFICATION UNCLEAR: API returned ${apiPrediction}.`);
        }

    } catch (error) {
        console.error('❌ Error calling API:', error);
    }
}

verifyApi();
