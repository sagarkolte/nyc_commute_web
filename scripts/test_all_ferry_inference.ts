
import { FERRY_SCHEDULE } from '../src/lib/ferry_schedule.ts';

function inferSchedule(routeId: string, stopId: string, expectedLine: string) {
    console.log(`--- Testing Inference for Stop=${stopId} (Expect: ${expectedLine}) ---`);

    let schedule = FERRY_SCHEDULE[routeId];

    // Logic from route.ts
    // If generic 'nyc-ferry', try to find which line this stop belongs to
    // Note: This logic must match route.ts exactly to be valid test
    if (!schedule && routeId === 'nyc-ferry') {
        const lineName = Object.keys(FERRY_SCHEDULE).find(key => {
            const s = FERRY_SCHEDULE[key];
            const sampleTrip = s.Weekday[0];
            return sampleTrip && sampleTrip.stops[stopId];
        });
        if (lineName) {
            schedule = FERRY_SCHEDULE[lineName];
            console.log(`[Result] Inferred '${lineName}'`);
            if (lineName === expectedLine) console.log("✅ PASS");
            else console.log(`❌ FAIL: Expected ${expectedLine}, got ${lineName}`);
        } else {
            console.log(`[Result] Could not infer line`);
            console.log(`❌ FAIL: Expected ${expectedLine}, got nothing`);
        }
    } else {
        console.log("Skipping logic check (Direct route or existing schedule)");
    }
}

// 1. East River (Stop 4 - Hunters Point S)
inferSchedule('nyc-ferry', '4', 'East River');

// 2. Astoria (Stop 25 - Roosevelt Island)
inferSchedule('nyc-ferry', '25', 'Astoria');

// 3. South Brooklyn (Stop 115 - Corlears Hook)
inferSchedule('nyc-ferry', '115', 'South Brooklyn');

// 4. Soundview (Stop 141 - Ferry Point Park)
inferSchedule('nyc-ferry', '141', 'Soundview');

// 5. Rockaway (Stop 88 - Rockaway)
inferSchedule('nyc-ferry', '88', 'Rockaway');

// 6. St George (Stop 137 - St George)
inferSchedule('nyc-ferry', '137', 'St. George');
