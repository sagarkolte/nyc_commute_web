
const { FERRY_SCHEDULE } = require('../src/lib/ferry_schedule');

// Mock route.ts context
const routeId = 'nyc-ferry';
const stopId = '4'; // Hunters Point S
const now = Math.floor(Date.now() / 1000);

console.log(`Diagnostic: Route=${routeId}, Stop=${stopId}, Time=${new Date(now * 1000).toISOString()}`);

// 1. Resolve Line Name
let schedule = FERRY_SCHEDULE[routeId];
console.log(`Initial Schedule lookup: ${schedule ? 'Found' : 'Null'}`);

// If generic 'nyc-ferry', try to find which line this stop belongs to
if (!schedule && routeId === 'nyc-ferry') {
    const lines = Object.keys(FERRY_SCHEDULE);
    console.log(`Checking lines: ${lines.join(', ')}`);

    const lineName = lines.find(key => {
        const s = FERRY_SCHEDULE[key];
        const sampleTrip = s.Weekday[0];
        console.log(`   Line ${key}: Sample Trip Stops = ${JSON.stringify(Object.keys(sampleTrip.stops))}`);
        const hasStop = sampleTrip && sampleTrip.stops[stopId];
        console.log(`   Line ${key}: Has stop '${stopId}'? ${!!hasStop}`);
        return hasStop;
    });

    if (lineName) {
        schedule = FERRY_SCHEDULE[lineName];
        console.log(`[Success] Inferred '${lineName}' for stop '${stopId}'`);
    } else {
        console.log(`[Fail] Could not infer line for stop '${stopId}'`);
    }
}

if (!schedule) {
    console.log("FINAL RESULT: Empty Schedule (No Info)");
} else {
    // 2. Generate Arrivals
    const day = new Date(now * 1000).getDay();
    const isWeekend = day === 0 || day === 6;
    const trips = isWeekend ? schedule.Weekend : schedule.Weekday;
    console.log(`Using ${isWeekend ? 'Weekend' : 'Weekday'} Schedule with ${trips.length} trips.`);

    const arrivals = [];
    trips.forEach(trip => {
        const stopTimeStr = trip.stops[stopId];
        if (stopTimeStr) {
            const [h, m] = stopTimeStr.split(':').map(Number);
            const date = new Date(now * 1000);
            date.setHours(h, m, 0, 0);
            let time = date.getTime() / 1000;

            // Debug check for ONE trip
            if (arrivals.length === 0) {
                console.log(`Sample Trip Time: ${stopTimeStr} -> ${time} (Now: ${now}) -> Diff: ${time - now}`);
            }

            if (time > now - 1800 && time < now + 14400) {
                arrivals.push(time);
            }
        }
    });
    console.log(`Generated ${arrivals.length} future arrivals.`);
}
