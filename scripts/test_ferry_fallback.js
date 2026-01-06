const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');

const FEED_URL = 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

// Simulate route.ts logic for routeId='nyc-ferry' with DESTINATION
async function testFallbackWithDest() {
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

    const stopId = '4'; // Hunters Point South
    const destStopId = '19'; // North Williamsburg
    const routeId = 'nyc-ferry'; // User's generic card

    console.log(`Simulating Request: routeId=${routeId}, stopId=${stopId}, destStopId=${destStopId}`);

    let count = 0;
    tripUpdates.forEach(t => {
        const updates = t.tripUpdate.stopTimeUpdate || [];
        const updateStops = updates.map(u => String(u.stopId));

        let originUpdate = null;

        const originIdx = updates.findIndex(u => String(u.stopId) === String(stopId));

        // NEW LOGIC SIMULATION
        if (destStopId && routeId === 'nyc-ferry') {
            if (originIdx !== -1) {
                const destIdx = updates.findIndex(u => String(u.stopId) === String(destStopId));
                if (destIdx !== -1) {
                    if (originIdx < destIdx) originUpdate = updates[originIdx];
                } else {
                    // RELAXED!
                    originUpdate = updates[originIdx];
                }
            }
        }

        if (originUpdate) {
            const arrivalTime = (originUpdate.arrival && originUpdate.arrival.time) ? originUpdate.arrival.time :
                (originUpdate.departure && originUpdate.departure.time) ? originUpdate.departure.time : null;

            // Time check
            // const now = Math.floor(Date.now() / 1000);
            // if (arrivalTime > now)
            if (arrivalTime) {
                count++;
                console.log(`MATCHED Trip ${t.tripUpdate.trip.tripId} (Dest in feed? ${updateStops.includes(destStopId)})`);
            }
        }
    });

    console.log(`Total Matches: ${count}`);
}

testFallbackWithDest();
