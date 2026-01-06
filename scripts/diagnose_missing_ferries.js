const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');

const FERRY_ROUTES = {
    'East River': ['87', '20', '8', '19', '18', '4', '17']
};

const FEED_URL = 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

async function diagnose() {
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
    console.log(`Current Time: ${new Date().toLocaleTimeString()} (Unix: ${now})\n`);

    const eastRiverDef = FERRY_ROUTES['East River'];
    let foundCount = 0;

    tripUpdates.forEach(t => {
        const updates = t.tripUpdate.stopTimeUpdate || [];
        const updateStops = updates.map(u => String(u.stopId));

        // Check if trip visits Hunters Point South (4)
        if (updateStops.includes('4')) {
            foundCount++;
            console.log(`TRIP ${t.tripUpdate.trip.tripId}`);
            console.log(`   Stops: ${updateStops.join(' -> ')}`);

            // 1. Matches East River?
            const matchesLine = updateStops.every(s => eastRiverDef.includes(s));
            console.log(`   Matches 'East River'? ${matchesLine}`);

            // 2. Origin Update Time
            const originUpdate = updates.find(u => u.stopId === '4');
            const arrivalTime = (originUpdate.arrival && originUpdate.arrival.time) ? originUpdate.arrival.time :
                (originUpdate.departure && originUpdate.departure.time) ? originUpdate.departure.time : null;

            if (arrivalTime) {
                // Determine if valid numeric
                const timeNum = Number(arrivalTime);
                const arrivalDate = new Date(timeNum * 1000);
                const isFuture = timeNum > now;
                console.log(`   Arrival at Stop 4: ${arrivalDate.toLocaleTimeString()} (Unix: ${timeNum})`);
                console.log(`   Is Future (> ${now})? ${isFuture}`);

                if (!isFuture) {
                    console.log(`   -> FILTERED (Past Time)`);
                }
            } else {
                console.log(`   -> FILTERED (No Time)`);
            }

            // 3. Destination Check (19)
            const destIdx = updateStops.indexOf('19');
            const originIdx = updateStops.indexOf('4');

            if (matchesLine) {
                if (destIdx !== -1) {
                    if (originIdx < destIdx) {
                        console.log(`   Dest (19) Found & Valid Order -> OK`);
                    } else {
                        console.log(`   Dest (19) Found but BEFORE Origin -> FAIL (Wrong Direction)`);
                    }
                } else {
                    console.log(`   Dest (19) Missing -> OK (Relaxed Filtering)`);
                }
            } else {
                console.log(`   -> FILTERED (Line Mismatch)`);
            }
            console.log('---');
        }
    });

    console.log(`\nTotal trips touching Stop 4: ${foundCount}`);
}

diagnose();
