
import { getNjtDepartures } from '../src/lib/njt';
require('dotenv').config({ path: '.env.local' });

async function verify() {
    console.log("--- Verifying NJT Fixes ---");

    // 1. Check Princeton Junction (PJ) -> Newark Penn (NP)
    console.log("\n1. Checking Princeton Junction (PJ) -> Newark Penn...");
    const pjDeps = await getNjtDepartures('PJ', 'NP');
    console.log(`Got ${pjDeps.length} departures.`);
    if (pjDeps.length > 0) {
        console.log("Next:", pjDeps[0]);
    } else {
        console.log("❌ No departures found for PJ -> NP");
    }

    // 2. Check Princeton (PR) -> Newark Penn (NP)
    console.log("\n2. Checking Princeton (PR) -> Newark Penn...");
    const prDeps = await getNjtDepartures('PR', 'NP');
    console.log(`Got ${prDeps.length} departures.`);
    if (prDeps.length > 0) {
        console.log("Next:", prDeps[0]);
    } else {
        console.log("❌ No departures found for PR -> NP");
    }

    // 3. Check Somerville (SM) -> NY Penn (Evening Coverage)
    // Current time is ~17:45 EST. 
    // If timezone fix is correct, we should see trains like 18:28, 19:01, etc.
    // If broken, they might be filtered out (as 14:00 EST).
    console.log("\n3. Checking Somerville (SM) -> NY Penn (Evening)...");
    const smDeps = await getNjtDepartures('SM', 'NY');
    console.log(`Got ${smDeps.length} departures.`);
    smDeps.slice(0, 5).forEach(d => {
        // Log time local representation if possible, or ISO
        console.log(`[${d.status}] ${d.time} (${d.train_id})`);
    });
}

verify();
