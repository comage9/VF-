
const http = require('http');

function verifyApi() {
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

    const payload = JSON.stringify({
        currentHour: currentHour,
        currentData: { total: currentTotal },
        basePredictions: basePredictions
    });

    const options = {
        hostname: 'localhost',
        port: 5174,
        path: '/api/ai/predict-hourly',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    console.log(`[Client Simulation] Sending request to http://localhost:5174/api/ai/predict-hourly...`);

    const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log('---------------------------------------------------');
                console.log('[API Response]', JSON.stringify(json, null, 2));
                console.log('---------------------------------------------------');

                const apiPrediction = json.predictions.hour_23;
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
            } catch (e) {
                console.error('❌ Error parsing response:', e);
                console.log('Raw response:', data);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`❌ Problem with request: ${e.message}`);
    });

    req.write(payload);
    req.end();
}

verifyApi();
