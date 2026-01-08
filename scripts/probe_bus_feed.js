
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const KEY = '2f669f60-86b5-43aa-9895-b5fd248ad6d3';

const URLS = [
    // Legacy OBA GTFS-RT
    `http://gtfsrt.prod.obanyc.com/tripUpdates?key=${KEY}`,
    `http://gtfsrt.prod.obanyc.com/vehiclePositions?key=${KEY}`,

    // New Portal Presumed IDs
    `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bus`,
    `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mta-bus%2Fgtfs`,
    // Valid Subway one for Reference (should 403 if key is bus-only, or 200 if key is general)
    `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs`
];

async function probe() {
    console.log(`Probing with Key: ${KEY.slice(0, 5)}...`);

    for (const url of URLS) {
        let fetchUrl = url;
        const headers = {};

        // If it's the api-endpoint domain, key goes in header
        if (url.includes('api-endpoint.mta.info')) {
            headers['x-api-key'] = KEY;
            // Remove key param if I accidentally added it
            fetchUrl = url.split('?')[0];
        }

        console.log(`\nChecking: ${fetchUrl.replace(KEY, 'XXX')}`);
        try {
            const res = await fetch(fetchUrl, { headers });
            console.log(`Status: ${res.status}`);
            if (res.ok) {
                const buf = await res.buffer();
                console.log(`✅ Success! Size: ${buf.length} bytes`);
                if (buf.length > 0) console.log("First bytes:", buf.slice(0, 10));
            } else {
                console.log(`❌ Failed:`, await res.text());
            }
        } catch (e) {
            console.log(`Error:`, e.message);
        }
    }
}

probe();
