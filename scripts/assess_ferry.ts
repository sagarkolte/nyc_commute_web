
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');

// INLINE DEFINITION FROM ferry_routes.ts
const FERRY_ROUTES = {
    'East River': ['87', '20', '8', '19', '18', '4', '17'],
    'Rockaway': ['104', '88', '46', '118', '87'],
    'Astoria': ['113', '89', '25', '90', '17', '120', '87'],
    'South Brooklyn': ['115', '20', '87', '11', '24', '118', '23'],
    'Soundview': ['141', '112', '113', '114', '17', '87'],
    'St. George': ['137', '136', '138'],
    'Coney Island': ['307', '23', '87']
};

const FEED_URL = 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

async function assessFerry() {
    console.log(`Fetching NYC Ferry feed from: ${FEED_URL}`);
    try {
        const response = await fetch(FEED_URL);
        if (!response.ok) {
            console.error(`Fetch failed: ${response.status} ${response.statusText}`);
            return;
        }

        let buffer;
        if (typeof response.arrayBuffer === 'function') {
            buffer = await response.arrayBuffer();
        } else {
            buffer = await response.buffer();
        }
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        const tripUpdates = feed.entity.filter(e => e.tripUpdate);
        console.log(`Fetched ${tripUpdates.length} trip updates.`);

        console.log('\n--- Simulation: Inferring "East River" trips ---');
        // Logic copied from route.ts
        const routeId = 'East River';
        const requestedFerryRouteStops = FERRY_ROUTES[routeId];

        let matchCount = 0;
        tripUpdates.forEach(t => {
            const updates = t.tripUpdate.stopTimeUpdate || [];
            const tripStops = updates.map(u => String(u.stopId));

            // Check if ALL observed stops are in the East River definition
            // (Logic from route.ts)
            const matchesLine = tripStops.every(s => requestedFerryRouteStops.includes(s));

            if (matchesLine) {
                matchCount++;
                // Check if it stops at Pier 11 (87)
                const originIdx = updates.findIndex(u => String(u.stopId) === '87');
                if (originIdx !== -1) {
                    const u = updates[originIdx];
                    const time = u.arrival?.time || u.departure?.time || 0;
                    const ts = new Date(Number(time) * 1000).toLocaleTimeString();
                    console.log(` MATCH [East River]: Trip ${t.tripUpdate.trip.tripId} @ Pier 11: ${ts}`);

                    // Check Destination
                    // In sparse feed, we might not see the destination (e.g. Stop 4 or 17)
                    const destId = '4'; // Hunters Point South
                    const destIdx = updates.findIndex(u => String(u.stopId) === destId);
                    if (destIdx === -1) {
                        console.log(`    (Destination ${destId} NOT visible, allows simplified inclusion)`);
                    } else {
                        console.log(`    (Destination ${destId} visible found at idx ${destIdx})`);
                    }
                }
            }
        });

        console.log(`\nTotal Inferred Matches for East River: ${matchCount}`);

        if (matchCount > 0) {
            console.log('SUCCESS: Inference logic identified trips.');
        } else {
            console.warn('FAILURE: No East River trips inferred. Check route definitions or feed content.');
        }

    } catch (error) {
        console.error('Error assessing ferry feed:', error);
    }
}

assessFerry();
