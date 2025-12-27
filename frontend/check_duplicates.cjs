// const fetch = require('node-fetch');

async function checkDuplicates() {
    const date = '2025-12-08';
    console.log(`Checking records for ${date}...`);

    const res = await fetch(`http://localhost:5174/api/outbound?start=${date}&end=${date}&limit=10000`);
    const records = await res.json();

    console.log(`Total records for ${date}: ${records.length}`);

    if (records.length === 0) return;

    // Check for duplicates (same product name)
    const productCounts = {};
    let totalSales = 0;
    let totalQty = 0;
    let zeroSalesCount = 0;

    records.forEach(r => {
        productCounts[r.productName] = (productCounts[r.productName] || 0) + 1;
        totalSales += r.salesAmount;
        totalQty += r.quantity;
        if (r.salesAmount === 0) zeroSalesCount++;
    });

    const duplicates = Object.entries(productCounts).filter(([_, count]) => count > 1);

    console.log(`Products with duplicates: ${duplicates.length}`);
    if (duplicates.length > 0) {
        console.log('Sample duplicates:', duplicates.slice(0, 5));
    }

    console.log(`Total Sales Amount: ${totalSales}`);
    console.log(`Total Quantity: ${totalQty}`);
    console.log(`Records with 0 Sales Amount: ${zeroSalesCount}`);

    // Inspect a few records
    console.log('Sample records:');
    records.slice(0, 5).forEach(r => {
        console.log(JSON.stringify(r, null, 2));
    });
}

checkDuplicates();
