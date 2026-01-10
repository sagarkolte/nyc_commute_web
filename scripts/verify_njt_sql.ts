
import { MtaService } from '../src/lib/mta'; // We need NJT logic, which is likely exposed or we import njt.ts directly
import * as njt from '../src/lib/njt';

async function verify() {
    console.log("--- Verifying NJT SQLite Schedule ---");

    // Test Case: NY Penn (NY) to New Brunswick (NB)
    // Ensure you have these IDs mapped in mapping.json (109 -> 106 typically)
    const origin = 'NY';
    const dest = 'NB';

    console.log(`Getting departures for ${origin} -> ${dest}...`);

    // Check if we can access the internal function or go through a public one
    // njt.getNjtDepartures is the main one.

    try {
        const deps = await njt.getNjtDepartures(origin, dest);
        console.log(`Found ${deps.length} departures.`);

        deps.slice(0, 3).forEach((d, i) => {
            console.log(`[${i}] ${d.time} | ${d.line} -> ${d.destination} (${d.status})`);
            console.log(`    ID: ${d.train_id}`);
        });

        if (deps.length > 0 && deps[0].train_id.startsWith('SQL-')) {
            console.log("✅ SUCCESS: Data sourced from SQLite (SQL- prefix found)!");
        } else if (deps.length > 0) {
            console.log("⚠️ WARNING: Data found but might be Realtime or JSON Fallback (No SQL- prefix).");
            // If realtime is active, it might replace SQL- ID with numeric ID.
            // But if it was purely static match, it would show.
        } else {
            console.error("❌ NO DATA FOUND.");
        }

    } catch (e) {
        console.error("Verification Error:", e);
    }
}

verify();
