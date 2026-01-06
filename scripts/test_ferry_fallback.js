const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');

const FEED_URL = 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

// Simulate route.ts logic for routeId='nyc-ferry'
async function testFallback() {
    console.log(`Fetching feed...`);
    const response = await fetch(FEED_URL);
    let buffer;
    if (typeof response.arrayBuffer === 'function') {
        buffer = await response.arrayBuffer();
    } else {
        buffer = await response.buffer();
    }
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    const tripUpdates = feed.entity.filter(e => e.tripUpdate);

    const now = Math.floor(Date.now() / 1000);
    const stopId = '4';
    const destStopId = '19';
    const routeId = 'nyc-ferry'; // Generic

    console.log(`Simulating Request: routeId=${routeId}, stopId=${stopId}, destStopId=${destStopId}`);

    let count = 0;
    tripUpdates.forEach(t => {
        const updates = t.tripUpdate.stopTimeUpdate || [];
        const updateStops = updates.map(u => String(u.stopId));

        let originUpdate = null;

        // LOGIC FROM route.ts (Simplified)
        // 1. No FERRY_ROUTES[routeId] match.

        // 2. Fallback block
        if (destStopId) {
            const originIdx = updates.findIndex(u => String(u.stopId) === String(stopId));
            const destIdx = updates.findIndex(u => String(u.stopId) === String(destStopId));

            if (originIdx !== -1 && destIdx !== -1 && originIdx < destIdx) {
                // Strict Match
                originUpdate = updates[originIdx];
            } else if (routeId === 'nyc-ferry' && originIdx !== -1) {
                // Permissive Match
                originUpdate = updates[originIdx];
            }
        }

        if (originUpdate) {
            const arrivalTime = (originUpdate.arrival && originUpdate.arrival.time) ? originUpdate.arrival.time :
                (originUpdate.departure && originUpdate.departure.time) ? originUpdate.departure.time : null;

            if (arrivalTime && arrivalTime > now) {
                count++;
                console.log(`MATCHED Trip ${t.tripUpdate.trip.tripId}. Time: ${new Date(arrivalTime * 1000).toLocaleTimeString()}`);
            }
        }
    });

    console.log(`Total Matches: ${count}`);
}

testFallback();
