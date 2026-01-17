const fs = require('fs');
const path = require('path');

async function verifyUpload() {
    try {
        const filePath = path.resolve('../delivery-data (49).xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }

        console.log('Reading file:', filePath);
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const formData = new FormData();
        formData.append('file', blob, 'delivery-data (49).xlsx');

        console.log('Sending request to http://localhost:5174/api/delivery/import-excel...');
        const response = await fetch('http://localhost:5174/api/delivery/import-excel', {
            method: 'POST',
            body: formData
        });

        const text = await response.text();
        console.log('Response Status:', response.status);
        try {
            const json = JSON.parse(text);
            console.log('Headers:', JSON.stringify(json.headers, null, 2));
            console.log('Mapped Data Sample:', JSON.stringify(json.mappedDataSample, null, 2));
        } catch (e) {
            console.log('Response Body (Text):', text);
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyUpload();
