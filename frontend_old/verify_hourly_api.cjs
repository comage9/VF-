// const fetch = require('node-fetch'); // Native fetch in Node 18+

async function verifyHourlyApi() {
    try {
        console.log('Testing GET http://localhost:5174/api/delivery/hourly?days=1 ...');
        const response = await fetch('http://localhost:5174/api/delivery/hourly?days=1');
        console.log('Status:', response.status);
        if (response.ok) {
            const json = await response.json();
            console.log('Success:', json.success);
            console.log('Data length:', json.data ? json.data.length : 0);
            if (json.data && json.data.length > 0) {
                console.log('Sample data:', JSON.stringify(json.data[0], null, 2));
            }
        } else {
            console.log('Response:', await response.text());
        }
    } catch (error) {
        console.error('Failed:', error);
    }
}

verifyHourlyApi();
