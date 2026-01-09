
const fetch = require('node-fetch');

const KEY = '2f669f60-86b5-43aa-9895-b5fd248ad6d3';
const URL = `http://gtfsrt.prod.obanyc.com/tripUpdates?key=${KEY}`;

async function testGtfs() {
    console.log(`Testing GTFS-RT: ${URL.replace(KEY, 'HIDDEN')}`);
    try {
        const res = await fetch(URL);
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            console.log("✅ GTFS-RT Feed is working!");
            const buffer = await res.arrayBuffer();
            console.log(`Received ${buffer.byteLength} bytes.`);
        } else {
            console.log("❌ Failed.");
        }
    } catch (e) {
        console.error("Exception:", e.message);
    }
}

testGtfs();
