
const { MtaService } = require('../src/lib/mta');
require('dotenv').config({ path: '.env.local' });

async function verify() {
    console.log("--- Verifying MTA Bus Implementation (Final CJS) ---");

    // 1. Search Route
    console.log("\n[1] Testing Search 'BXM7'...");
    const results = await MtaService.searchBusRoutes('BXM7', 'ignored');
    console.log(`Found ${results.length} results for 'BXM7'.`);

    if (results.length === 0) {
        console.error("❌ Search Failed!");
        return;
    }
    const route = results[0];
    console.log("Top Match:", route.id, route.shortName);

    // 2. Fetch Stops (NEW)
    console.log(`\n[2] Testing Stop Fetch for '${route.id}'...`);
    const stops = await MtaService.getBusStops(route.id, 'ignored');
    console.log(`Found ${stops.length} stops.`);
    if (stops.length > 0) {
        console.log("Sample Stop:", stops[0]);
        // Check if it's the ANY stop
        if (stops[0].id === 'ANY') {
            console.warn("⚠️ Warning: Returned Mock 'ANY' Stop (Static Index Lookup Failed?)");
        } else {
            console.log("✅ Success! returned real stops.");
        }
    } else {
        console.error("❌ No Stops Found!");
    }

    // 3. Realtime
    console.log(`\n[3] Testing Realtime for '${route.id}'...`);
    try {
        const feed = await MtaService.fetchFeed(route.id, 'ignored', stops[0]?.id || 'StopX');
        if (feed.type === 'custom-bus') {
            const updates = feed.data;
            console.log(`✅ Success! Received ${updates.length} bus updates.`);
            if (updates.length > 0) {
                console.log("Sample Update:", updates[0]);
            }
        } else {
            console.log(`Feed Type: ${feed.type} (Unexpected if Bus)`);
        }
    } catch (e) {
        console.error("❌ Realtime Fetch Failed:", (e as any).message);
    }
}

verify();
