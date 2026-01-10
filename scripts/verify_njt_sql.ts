
import { MtaService } from '../src/lib/mta';
import * as njt from '../src/lib/njt';

async function verify() {
    console.log("--- Verifying NJT SQLite Schedule (Failing Routes) ---");

    // Test Case: Multiple failing routes
    const tests = [
        { origin: 'TR', dest: 'NY', name: 'Trenton -> NY' },
        { origin: 'DO', dest: 'NY', name: 'Dover -> NY' },
        { origin: 'LB', dest: 'NY', name: 'Long Branch -> NY' }
    ];

    for (const t of tests) {
        console.log(`\nTesting ${t.name} (${t.origin} -> ${t.dest})...`);
        try {
            const deps = await njt.getNjtDepartures(t.origin, t.dest);
            console.log(`Found ${deps.length} departures.`);

            deps.slice(0, 3).forEach((d, i) => {
                console.log(`[${i}] ${d.time} | ${d.line} -> ${d.destination}`);
                console.log(`    ID: ${d.train_id}`);
            });

            if (deps.length > 0 && deps[0].train_id.startsWith('SQL-')) {
                console.log("✅ SUCCESS: Data sourced from SQLite.");
            } else if (deps.length > 0) {
                console.warn("⚠️  WARNING: Data found but likely Realtime/JSON fallback.");
            } else {
                console.error("❌ NO DATA FOUND.");
            }

        } catch (e) {
            console.error("Verification Error:", e);
        }
    }
}

verify();
