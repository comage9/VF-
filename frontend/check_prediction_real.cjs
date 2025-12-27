
const http = require('http');

// 1. Get Current Data
http.get('http://localhost:5174/api/delivery/hourly', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const json = JSON.parse(data);
        const todayStr = new Date().toISOString().split('T')[0]; // 2025-12-11
        const todayData = json.data.find(d => d.date === todayStr);

        if (!todayData) {
            console.log('No data for today.');
            return;
        }

        console.log(`Current Total: ${todayData.total}`);
        console.log(`16:00 Value (Actual): ${todayData.hour_16}`);

        // 2. Simulate Prediction Request
        // We need to simulate what the frontend sends.
        // The frontend calculates 'basePredictions' locally. 
        // Since we can't easily run frontend code here, we will check what the backend returns
        // IF we send the current data. 
        // BUT, the backend now relies on 'basePredictions' from the frontend!
        // So if we don't send basePredictions, the backend will fallback to naive logic (current + 100).

        // Let's calculate a realistic basePrediction based on verified increment (28.6)
        // Current is 311 at 16:00.
        // Remaining hours: 7.
        // Predicted increase = 28.6 * 7 = 200.2.
        // Predicted Final = 311 + 200 = 511.

        const basePredictions = {
            hour_23: 511
        };

        const payload = JSON.stringify({
            currentHour: 17, // Current time is 17:41
            currentData: todayData,
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

        const req = http.request(options, (pRes) => {
            let pData = '';
            pRes.on('data', (c) => pData += c);
            pRes.on('end', () => {
                const pJson = JSON.parse(pData);
                console.log('Prediction Response:', JSON.stringify(pJson, null, 2));
            });
        });
        req.write(payload);
        req.end();
    });
});
