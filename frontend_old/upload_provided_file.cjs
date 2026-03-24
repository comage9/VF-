const fs = require('fs');
const path = require('path');

async function uploadProvidedFile() {
    try {
        const filePath = path.resolve('../delivery-data (49).xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }

        console.log('Reading file:', filePath);
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'text/csv' });

        const formData = new FormData();
        formData.append('file', blob, '일별 출고 수량 보고용 - 시트4.csv');

        console.log('Sending request to http://localhost:5174/api/delivery/import-excel...');
        const response = await fetch('http://localhost:5174/api/delivery/import-excel', {
            method: 'POST',
            body: formData
        });

        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text);

    } catch (error) {
        console.error('Upload failed:', error);
    }
}

uploadProvidedFile();
