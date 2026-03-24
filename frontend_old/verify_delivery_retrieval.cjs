// const fetch = require('node-fetch');

async function verifyDeliveryRetrieval() {
    try {
        console.log('Fetching delivery data from http://localhost:5174/api/delivery/hourly?days=365 ...');
        const response = await fetch('http://localhost:5174/api/delivery/hourly?days=365');

        if (!response.ok) {
            console.error('API Error:', response.status, await response.text());
            return;
        }

        const json = await response.json();
        if (!json.success) {
            console.error('API Success False:', json);
            return;
        }

        const data = json.data;
        console.log(`Retrieved ${data.length} records.`);

        // Find the record for 2025-12-10
        const targetDate = '2025-12-10';
        const record = data.find(r => r.date === targetDate);

        if (record) {
            console.log(`FOUND Record for ${targetDate}:`);
            console.log(JSON.stringify(record, null, 2));

            if (record.total === 67) {
                console.log('VERIFICATION PASSED: Total matches uploaded data (67).');
            } else {
                console.error(`VERIFICATION FAILED: Total is ${record.total}, expected 67.`);
            }
        } else {
            console.error(`VERIFICATION FAILED: Record for ${targetDate} NOT FOUND.`);
            console.log('Available dates sample:', data.slice(0, 5).map(r => r.date));
        }

    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

verifyDeliveryRetrieval();
