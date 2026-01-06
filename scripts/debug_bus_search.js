
// MtaService import removed for JS compatibility
// Actually, since it's TS, running this via plain node might fail on imports.
// I'll use the 'axios' approach to hit the API route directly if local server is running, 
// OR simpler: use the tsx runner like I did for verification.

const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function testBusSearch() {
    const query = 'Q1';
    console.log(`Testing Bus Search for query: "${query}"...`);

    // We can't easily call MtaService directly without TS compilation or tsx.
    // But we know the logic:
    // 1. Fetches all routes for MTA NYCT and MTABC
    // 2. Finds FIRST match starting with query
    // 3. Fetches stops for that route

    // Let's emulate the "Fetching all routes" part using OBA API directly to see what matches we MISS if we only pick the first one.

    const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY || process.env.MTA_API_KEY;
    if (!API_KEY) {
        console.error("No API Key found");
        return;
    }

    const OBA_BASE = 'http://bustime.mta.info/api/where';
    const agencies = ['MTA NYCT', 'MTABC'];
    let allRoutes = [];

    console.log("Fetching all routes from OBA...");
    for (const agency of agencies) {
        try {
            const url = `${OBA_BASE}/routes-for-agency/${encodeURIComponent(agency)}.json?key=${API_KEY}`;
            const res = await axios.get(url);
            if (res.data.data && res.data.data.list) {
                allRoutes.push(...res.data.data.list);
                console.log(`Fetched ${res.data.data.list.length} routes for ${agency}`);
            }
        } catch (e) {
            console.error(`Failed to fetch ${agency}`, e.message);
        }
    }

    console.log(`Total Routes: ${allRoutes.length}`);

    // Simulation of current logic
    const queryLower = query.toLowerCase();
    const firstMatch = allRoutes.find(r => r.shortName.toLowerCase().startsWith(queryLower));

    if (firstMatch) {
        console.log(`\n[Current Logic] Selected Route: ${firstMatch.shortName} (${firstMatch.id})`);
    } else {
        console.log("\n[Current Logic] No match found.");
    }

    // What we SHOULD return (All matches)
    const allMatches = allRoutes.filter(r => r.shortName.toLowerCase().startsWith(queryLower));
    console.log(`\n[Ideal Logic] Found ${allMatches.length} matches starting with "${query}":`);
    console.log(allMatches.map(r => r.shortName).slice(0, 15).join(", ") + (allMatches.length > 15 ? "..." : ""));

    // Check specifically for Q1 vs Q115
    const q1 = allMatches.find(r => r.shortName === 'Q1');
    const q115 = allMatches.find(r => r.shortName === 'Q115');

    console.log(`\nCheck:`);
    console.log(`Q1 Found? ${!!q1}`);
    console.log(`Q115 Found? ${!!q115}`);

    if (firstMatch && firstMatch.shortName !== 'Q115' && q115) {
        console.log("\nCONCLUSION: The current logic picks matches like 'Q1' and ignores 'Q115' unless they share stops (which is unlikely for disparate routes).");
    }
}

testBusSearch();
