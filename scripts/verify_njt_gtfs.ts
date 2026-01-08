
import { getNjtDepartures } from '../src/lib/njt';
require('dotenv').config({ path: '.env.local' });

async function verify() {
    console.log("--- Verifying NJT GTFS-RT Integration ---");

    // Test Somerville -> Newark Penn
    const station = 'SM'; // 148
    console.log(`Fetching departures for ${station}...`);

    const deps = await getNjtDepartures(station, 'NP'); // Filter for Newark Penn

    console.log(`Got ${deps.length} departures.`);

    deps.slice(0, 5).forEach(d => {
        console.log(`[${d.status}] ${d.time} -> ${d.destination} (ID: ${d.train_id})`);
        // Check Source:
        if (d.train_id.startsWith('STATIC')) {
            console.log("  -> Source: Static Schedule (Fallback)");
        } else {
            console.log("  -> Source: GTFS-RT (Live!)");
        }
    });

    // Check Coverage
    const hasLive = deps.some(d => !d.train_id.startsWith('STATIC'));
    if (hasLive) {
        console.log("\n✅ SUCCESS: Integrated GTFS-RT data found!");
    } else {
        console.log("\n⚠️ WARNING: Only Static data found. (Feed might not cover this station/time, or matching failed)");
    }
}

verify();
