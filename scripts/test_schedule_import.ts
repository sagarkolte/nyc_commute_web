

import { FERRY_SCHEDULE } from '../src/lib/ferry_schedule.ts';


// Logic from route.ts
function inferSchedule(routeId: string, stopId: string) {
    let schedule = FERRY_SCHEDULE[routeId];

    // If generic 'nyc-ferry', try to find which line this stop belongs to
    if (!schedule && routeId === 'nyc-ferry') {
        const lineName = Object.keys(FERRY_SCHEDULE).find(key => {
            const s = FERRY_SCHEDULE[key];
            const sampleTrip = s.Weekday[0];
            return sampleTrip && sampleTrip.stops[stopId];
        });
        if (lineName) {
            schedule = FERRY_SCHEDULE[lineName];
            console.log(`[Success] Inferred '${lineName}' for stop '${stopId}'`);
        } else {
            console.log(`[Fail] Could not infer line for stop '${stopId}'`);
        }
    }

    // Also verify schedule content
    if (schedule && schedule.Weekday && schedule.Weekday.length > 0) {
        console.log(`[Schedule] Found ${schedule.Weekday.length} weekday trips.`);
        const trip = schedule.Weekday[0];
        console.log(`[Sample Trip] Stops: ${JSON.stringify(trip.stops)}`);

        // Check if Stop 4 is in there
        if (trip.stops['4']) console.log(`[Check] Stop 4 found in sample trip.`);
        else console.log(`[Check] Stop 4 NOT found in sample trip.`);
    } else {
        console.log(`[Fail] Schedule empty or invalid.`);
    }
}

console.log('--- Test Actual Import: Generic ID + Stop 4 ---');
inferSchedule('nyc-ferry', '4');
