
const http = require('http');

http.get('http://localhost:5174/api/delivery/hourly', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`; // "2025-12-11"

            console.log(`Checking data for today: ${dateStr}`);

            const todayData = json.data.find(d => d.date === dateStr);

            if (todayData) {
                console.log('Found today data:', JSON.stringify(todayData, null, 2));
                console.log(`Value at 16:00 (hour_16): ${todayData.hour_16}`);
            } else {
                console.log('No data found for today.');
                // Show the last available data just in case
                if (json.data.length > 0) {
                    const last = json.data[json.data.length - 1];
                    console.log(`Last available data (${last.date}): hour_16 = ${last.hour_16}`);
                }
            }
        } catch (e) {
            console.error(e);
        }
    });
});
