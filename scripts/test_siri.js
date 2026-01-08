
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const SIRI_BASE = 'http://bustime.mta.info/api/siri';
// const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
const API_KEY = '2f669f60-86b5-43aa-9895-b5fd248ad6d3'; // Hardcode safely for local test to match user input

async function testSiri() {
    console.log(`Testing SIRI with Key: ${API_KEY.slice(0, 5)}...`);

    // Test 1: Vehicle Monitoring (Global) - Should return something if key is valid
    const url = `${SIRI_BASE}/vehicle-monitoring.json?key=${API_KEY}&version=2`;
    console.log(`Fetching: ${url.replace(API_KEY, 'XXX')}`);

    try {
        const res = await fetch(url);
        console.log(`Status: ${res.status}`);
        const text = await res.text();

        try {
            const json = JSON.parse(text);
            if (json.Siri) {
                console.log("✅ SIRI Response Valid!");
                if (res.status === 200) {
                    const del = json.Siri.ServiceDelivery;
                    if (del && del.VehicleMonitoringDelivery) {
                        const activity = del.VehicleMonitoringDelivery[0].VehicleActivity;
                        console.log(`Found ${activity ? activity.length : 0} vehicles.`);
                        if (activity && activity.length > 0) {
                            console.log("Sample:", JSON.stringify(activity[0], null, 2));
                        }
                    } else {
                        console.log("Empty Delivery:", JSON.stringify(del));
                    }
                } else {
                    console.log("⚠️ API Error Response:", JSON.stringify(json, null, 2));
                }
            } else {
                console.log("❌ Valid JSON but missing 'Siri' root:", Object.keys(json));
                console.log(text.slice(0, 500));
            }
        } catch (e) {
            console.log("❌ JSON Parse Failed (Body likely null/empty):");
            console.log(text.slice(0, 200));
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

testSiri();
