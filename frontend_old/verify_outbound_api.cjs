async function verifyOutboundApi() {
    try {
        console.log('Testing GET http://localhost:5174/api/outbound?limit=5 ...');
        const res1 = await fetch('http://localhost:5174/api/outbound?limit=5');
        console.log('Records Status:', res1.status);
        if (res1.ok) {
            const records = await res1.json();
            console.log('Records Count:', records.length);
            if (records.length > 0) {
                console.log('Sample Record:', JSON.stringify(records[0], null, 2));
            }
        } else {
            console.log('Records Error:', await res1.text());
        }

        console.log('\nTesting GET http://localhost:5174/api/outbound/stats ...');
        const res2 = await fetch('http://localhost:5174/api/outbound/stats');
        console.log('Stats Status:', res2.status);
        if (res2.ok) {
            const stats = await res2.json();
            console.log('Stats Summary:', JSON.stringify(stats.summary, null, 2));
        } else {
            console.log('Stats Error:', await res2.text());
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyOutboundApi();
