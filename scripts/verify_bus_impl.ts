
import { MtaService } from '../src/lib/mta';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    console.log("--- Verifying MTA Bus Implementation ---");

    // 1. Search
    console.log("\n[1] Testing Search 'M23'...");
    const results = await MtaService.searchBusRoutes('M23', 'ignored_key');
    console.log(`Found ${results.length} results.`);
    if (results.length > 0) {
        console.log("Top Match:", JSON.stringify(results[0], null, 2));
    } else {
        console.error("❌ Search Failed!");
    }

    // 2. Realtime
    console.log("\n[2] Testing Realtime 'Q115'...");
    // Note: Q115 should be in our index if it was active during build.
    // If not, we try one that was returned in search.
    const routeId = results.length > 0 ? results[0].id : 'Q115';
    console.log(`Fetching feed for ${routeId}...`);

    try {
        const feed = await MtaService.fetchFeed(routeId, 'ignored_key', 'any_stop');
        console.log(`Feed Type: ${feed.type}`);

        if (feed.type === 'custom-bus') {
            const updates = feed.data as any[]; // Cast to expected array
            console.log(`Received ${updates.length} bus updates.`);
            if (updates.length > 0) {
                console.log("Sample Update:", JSON.stringify(updates[0], null, 2));
            } else {
                console.warn("⚠️ No active buses found (might be quiet time or filtering issue).");
            }
        } else {
            console.error("❌ Unexpected Feed Type:", feed.type);
        }
    } catch (e) {
        console.error("❌ Realtime Fetch Failed:", e);
    }
}

verify();
