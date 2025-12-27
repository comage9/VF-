
const fs = require('fs');
const path = require('path');

// 1. Load the downloaded dashboard.js content
const dashboardPath = path.join(__dirname, 'downloaded_dashboard.js');
const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

// 2. Extract the calculateLinearIncrement function body
// We need to be careful with parsing. We'll look for the specific function definition.
// The function signature is: calculateLinearIncrement(currentHour, currentValue, sameDayData) {
const funcStart = dashboardCode.indexOf('calculateLinearIncrement(currentHour, currentValue, sameDayData) {');
if (funcStart === -1) {
    console.error("❌ Could not find calculateLinearIncrement function in the downloaded file.");
    process.exit(1);
}

// Simple brace counting to find the end of the function
let braceCount = 0;
let funcEnd = -1;
let foundStart = false;

for (let i = funcStart; i < dashboardCode.length; i++) {
    if (dashboardCode[i] === '{') {
        braceCount++;
        foundStart = true;
    } else if (dashboardCode[i] === '}') {
        braceCount--;
    }

    if (foundStart && braceCount === 0) {
        funcEnd = i + 1;
        break;
    }
}

if (funcEnd === -1) {
    console.error("❌ Could not parse function body.");
    process.exit(1);
}

const funcBody = dashboardCode.substring(funcStart, funcEnd);
console.log("Found function in deployed code:");
console.log("---------------------------------------------------");
console.log(funcBody);
console.log("---------------------------------------------------");

// 3. Create a standalone function from the extracted code
// We'll wrap it in a class-like structure or just eval it to test.
// To make it easy, let's just eval a wrapper.

const evalCode = `
    const dashboard = {
        ${funcBody}
    };
    
    // Test Data
    const currentHour = 16;
    const currentValue = 4000; // SPIKE
    const sameDayData = [
        { hour_16: 280, hour_23: 480 }, // +200 / 7 = 28.5
        { hour_16: 300, hour_23: 500 }, // +200 / 7 = 28.5
        { hour_16: 320, hour_23: 520 }, // +200 / 7 = 28.5
        { hour_16: 290, hour_23: 490 }, // +200 / 7 = 28.5
        { hour_16: 310, hour_23: 510 }  // +200 / 7 = 28.5
    ];

    console.log("\\nRunning Test with Spike Data (4000 at 16:00)...");
    const result = dashboard.calculateLinearIncrement(currentHour, currentValue, sameDayData);
    console.log("Result:", result);
    
    if (result < 50) {
        console.log("✅ VERIFICATION SUCCESS: Prediction ignored the spike.");
    } else {
        console.log("❌ VERIFICATION FAILED: Prediction was influenced by the spike.");
    }
`;

try {
    eval(evalCode);
} catch (e) {
    console.error("❌ Error executing verification:", e);
}
