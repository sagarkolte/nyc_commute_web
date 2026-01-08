
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const OBA_BASE = 'http://bustime.mta.info/api/where';
const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY || process.env.MTA_BUS_API_KEY;

async function checkAgencies() {
    const url = `${OBA_BASE}/agencies-with-coverage.json?key=${API_KEY}`;
    console.log(`Checking Agencies: ${url.replace(API_KEY, 'XXX')}`);
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log("Agencies Response:", text.slice(0, 200));
    } catch (e) { console.error(e); }
}

async function debugSearch(query) {
    await checkAgencies();

    console.log(`\nSearching for: "${query}"...`);

    // Try underscore
    const agencies = ['MTA NYCT', 'MTABC', 'MTA_NYCT', 'MTA+NYCT'];

    for (const agency of agencies) {
        const url = `${OBA_BASE}/routes-for-agency/${encodeURIComponent(agency)}.json?key=${API_KEY}`;
        console.log(`Fetching: ${url.replace(API_KEY, 'XXX')}`);

        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status}`);
            if (res.ok) {
                const text = await res.text();
                // console.log("Raw Response Snippet:", text.slice(0, 500));

                try {
                    const json = JSON.parse(text);
                    if (json.data && json.data.list) {
                        console.log(`Agency ${agency}: Found ${json.data.list.length} routes.`);
                        const match = json.data.list.find(r => r.shortName === query);
                        if (match) {
                            console.log("✅ FOUND MATCH:", match);
                        } else {
                            console.log(`❌ No exact match for ${query} in ${agency}`);
                            console.log("Sample:", json.data.list.slice(0, 3).map(r => r.shortName));
                        }
                    } else {
                        console.log("Structure unexpected keys:", Object.keys(json));
                        console.log("Full JSON:", JSON.stringify(json).slice(0, 500));
                    }
                } catch (e) {
                    console.log("JSON Parse Failed:", e.message);
                    console.log("Raw Text:", text.slice(0, 200));
                }
            } else {
                console.log("Error Body:", await res.text());
            }
        } catch (e) {
            console.error("Fetch failed:", e);
        }
    }
}

debugSearch('M23');
debugSearch('Q115'); // Known good?
