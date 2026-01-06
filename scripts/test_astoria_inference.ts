
import { FERRY_SCHEDULE } from '../src/lib/ferry_schedule.ts';

function inferSchedule(routeId: string, stopId: string) {
    console.log(`--- Testing Inference for Route=${routeId}, Stop=${stopId} ---`);

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

    if (schedule && schedule.Weekday && schedule.Weekday.length > 0) {
        console.log(`[Schedule] Found ${schedule.Weekday.length} weekday trips.`);
        const trip = schedule.Weekday[0];
        console.log(`[Sample Trip ID] ${trip.tripId}`);
        console.log(`[Sample Trip Stops] ${JSON.stringify(Object.keys(trip.stops))}`);

        if (trip.stops[stopId]) console.log(`[Check] Stop ${stopId} found in sample trip.`);
        else console.log(`[Check] Stop ${stopId} NOT found in sample trip.`);
    } else {
        console.log(`[Fail] Schedule empty or invalid.`);
    }
}

// Test Astoria (Roosevelt Island = 25)
inferSchedule('nyc-ferry', '25');

// Test East River (Hunters Point S = 4)
inferSchedule('nyc-ferry', '4');

// Test Unknown
inferSchedule('nyc-ferry', '9999');
