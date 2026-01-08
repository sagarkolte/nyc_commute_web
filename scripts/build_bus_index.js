
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Using the working feed URL
const FEED_URL = `http://gtfsrt.prod.obanyc.com/tripUpdates?key=${process.env.NEXT_PUBLIC_MTA_BUS_API_KEY}`;
const OUT_FILE = path.join(__dirname, '../src/lib/mta_bus_index.json');

async function buildIndex() {
    console.log("Fetching Bus Feed to build index...");
    try {
        const res = await fetch(FEED_URL);
        if (!res.ok) throw new Error(`Status ${res.status}`);

        const buffer = await res.buffer();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
        console.log(`Entities: ${feed.entity.length}`);

        const routes = new Set();

        feed.entity.forEach(e => {
            if (e.tripUpdate && e.tripUpdate.trip && e.tripUpdate.trip.routeId) {
                routes.add(e.tripUpdate.trip.routeId);
            }
        });

        console.log(`Found ${routes.size} unique active routes.`);

        // Convert to array of objects
        const routeList = Array.from(routes).sort().map(id => {
            // Heuristic to clean up IDs if needed (e.g. "MTA NYCT_M23" -> "M23")
            // But OBA/GTFS-RT usually uses "M23" or "MTABC_Q115"
            // Let's keep ID as is for fetching, but generate a display name
            let shortName = id;
            if (id.includes('_')) shortName = id.split('_')[1];

            return {
                id: id,
                shortName: shortName,
                longName: `Route ${shortName}` // Placeholder since RT feed doesn't have long names
            };
        });

        fs.writeFileSync(OUT_FILE, JSON.stringify(routeList, null, 2));
        console.log(`Wrote index to ${OUT_FILE}`);

    } catch (e) {
        console.error("Build Failed:", e);
    }
}

buildIndex();
