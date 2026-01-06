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

        console.log('\n--- Simulation: Inferring "East River" trips & Destinations ---');
        const routeId = 'East River';
        const requestedFerryRouteStops = FERRY_ROUTES[routeId];

        let matchCount = 0;
        tripUpdates.forEach((t, i) => {
            const updates = t.tripUpdate.stopTimeUpdate || [];
            const tripStops = updates.map(u => String(u.stopId));

            const matchesLine = tripStops.every(s => requestedFerryRouteStops.includes(s));

            if (matchesLine && tripStops.length > 0) {
                matchCount++;

                let inferredDest = "Unknown";
                const firstStopId = String(updates[0].stopId);
                const lastStopId = String(updates[updates.length - 1].stopId);
                const firstIdx = requestedFerryRouteStops.indexOf(firstStopId);
                const lastIdx = requestedFerryRouteStops.indexOf(lastStopId);

                if (firstIdx !== -1 && lastIdx !== -1) {
                    if (firstIdx <= lastIdx) {
                        const destId = requestedFerryRouteStops[requestedFerryRouteStops.length - 1];
                        inferredDest = `End of Line Forward (ID: ${destId})`;
                    } else {
                        const destId = requestedFerryRouteStops[0];
                        inferredDest = `End of Line Reverse (ID: ${destId})`;
                    }
                }

                if (i < 10) {
                    console.log(`TRIP ${t.tripUpdate.trip.tripId}`);
                    // console.log(`   Stops: ${tripStops.join(' -> ')}`);
                    console.log(`   Inferred Dest: ${inferredDest}`);
                }
            }
        });

        console.log(`\nTotal Inferred Matches for East River: ${matchCount}`);

    } catch (error) {
        console.error('Error assessing ferry feed:', error);
    }
}

assessFerry();
