
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const API_KEY = '2f669f60-86b5-43aa-9895-b5fd248ad6d3';

async function testKey() {
    console.log("--- Testing API Key Capabilities ---");

    // 1. OBA Discovery (Stops)
    console.log("\n[1] Testing OBA Discovery (stops-for-route)...");
    const obaUrl = `http://bustime.mta.info/api/where/stops-for-route/MTA%20NYCT_M23%2B.json?key=${API_KEY}`;
    try {
        const res = await fetch(obaUrl);
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Raw Body (First 100 chars): ${text.substring(0, 100)}...`);
    } catch (e) {
        console.error("OBA Fail:", e.message);
    }

    // 2. SIRI (Vehicle Monitoring)
    console.log("\n[2] Testing SIRI (vehicle-monitoring)...");
    const siriUrl = `http://bustime.mta.info/api/siri/vehicle-monitoring.json?key=${API_KEY}&LineRef=MTA%20NYCT_M23%2B`;
    try {
        const res = await fetch(siriUrl);
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Raw Body (First 100 chars): ${text.substring(0, 100)}...`);
    } catch (e) {
        console.error("SIRI Fail:", e.message);
    }
}

testKey();
