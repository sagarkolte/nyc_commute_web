
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const API_KEY = '2f669f60-86b5-43aa-9895-b5fd248ad6d3';
const BASE_URL = 'http://bustime.mta.info/api/siri/vehicle-monitoring.json'; // This is for VM
// The OBA Discovery API is usually: http://bustime.mta.info/api/where/stops-for-route/{routeId}.json?key=...

async function testStops() {
    const routeId = 'MTA NYCT_M23+'; // From m23_stops.json
    const url = `http://bustime.mta.info/api/where/stops-for-route/${encodeURIComponent(routeId)}.json?key=${API_KEY}`;

    console.log(`Testing URL: ${url.replace(API_KEY, 'HIDDEN')}`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Status: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Body:', text);
            return;
        }
        const data = await res.json();
        console.log("Response Data:", JSON.stringify(data, null, 2));
        if (data && data.code === 200) {
            console.log("✅ Success! Found stops.");
            console.log(`Stop count: ${data.data.stops.length}`);
        } else {
            console.log("❌ API returned error code:", data.code);
            console.log("Text:", data.text);
        }
    } catch (e) {
        console.error("❌ Exception:", e);
    }
}

testStops();
