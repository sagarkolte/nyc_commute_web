
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs' }
});

const { MtaService } = require('../src/lib/mta');
require('dotenv').config({ path: '.env.local' });

async function verify() {
    console.log("--- Verifying MTA Bus Implementation (Final) ---");

    // 1. Search
    console.log("\n[1] Testing Search 'M23'...");
    const results = await MtaService.searchBusRoutes('M23', 'ignored');
    console.log(`Found ${results.length} results for 'M23'.`);
    if (results.length > 0) {
        console.log("Top Match:", results[0]);
    } else {
        console.error("❌ Search Failed!");
    }

    // 2. Realtime
    const testRoute = results.length > 0 ? results[0].id : 'Q115';
    console.log(`\n[2] Testing Realtime for '${testRoute}'...`);

    try {
        const feed = await MtaService.fetchFeed(testRoute, 'ignored', 'StopX');
        // console.log(`Feed Type: ${feed.type}`);

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
        console.error("❌ Realtime Fetch Failed:", e.message);
    }
}

verify();
