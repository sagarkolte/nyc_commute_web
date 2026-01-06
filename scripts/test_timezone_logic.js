
// Simulate route.ts logic
const now = Math.floor(Date.now() / 1000);

// Mock Schedule Input: 17:34 (5:34 PM)
// We want this to result in a Unix Timestamp that equals 5:34 PM NYC Time today.
const h = 17;
const m = 34;

console.log(`Current Server Time: ${new Date(now * 1000).toISOString()}`);
console.log(`Target NYC Schedule: ${h}:${m}`);

// --- LOGIC UNDER TEST ---
const targetLocal = new Date(now * 1000);
targetLocal.setHours(h, m, 0, 0);

const nycStr = new Date(now * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' });
// Note: In Node, toLocaleString might behave differently than Browser if ICU data missing? 
// Standard Node includes full ICU usually.

const nycDateAsLocal = new Date(nycStr);
const serverNow = new Date(now * 1000);

const tzOffsetMs = serverNow.getTime() - nycDateAsLocal.getTime();
// console.log(`Offset MS: ${tzOffsetMs} (${tzOffsetMs / 3600000} hours)`);

let time = (targetLocal.getTime() + tzOffsetMs) / 1000;
// --- END LOGIC ---

console.log(`Calculated Timestamp: ${time}`);
console.log(`Calculated ISO:       ${new Date(time * 1000).toISOString()}`);

// Verify:
// Convert calculated timestamp back to NYC string. Should be 17:34.
const checkStr = new Date(time * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
console.log(`Verification (NYC Time): ${checkStr}`);

if (checkStr.startsWith(`${h}:${m}`)) {
    console.log("PASS: matches scheduled time.");
} else {
    console.log("FAIL: mismatch.");
}
