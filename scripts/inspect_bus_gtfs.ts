
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const FEED_URL = `http://gtfsrt.prod.obanyc.com/tripUpdates?key=${process.env.NEXT_PUBLIC_MTA_BUS_API_KEY}`;

async function inspect() {
    console.log("Fetching Bus Feed...");
    const res = await fetch(FEED_URL);
    if (!res.ok) {
        console.error("Failed:", res.status);
        return;
    }
    const buffer = await res.buffer();
    console.log("Size:", buffer.length);

    try {
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
        console.log(`Entities: ${feed.entity.length}`);

        let m23Count = 0;
        let q115Count = 0;

        // Sample first 3
        feed.entity.slice(0, 3).forEach(e => {
            if (e.tripUpdate) {
                console.log("Sample Trip:", JSON.stringify(e.tripUpdate.trip, null, 2));
            }
        });

        feed.entity.forEach(e => {
            if (e.tripUpdate && e.tripUpdate.trip) {
                const route = e.tripUpdate.trip.routeId;
                if (route === 'M23' || route === 'MTA NYCT_M23') m23Count++;
                if (route === 'Q115' || route === 'MTABC_Q115') q115Count++;
            }
        });

        console.log(`Found M23 Updates: ${m23Count}`);
        console.log(`Found Q115 Updates: ${q115Count}`);

    } catch (e) {
        console.error("Decode Failed:", e);
    }
}

inspect();
