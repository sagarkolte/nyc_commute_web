
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const http = require('http');

const FEED_URL = 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

function fetchFeed() {
    return new Promise((resolve, reject) => {
        http.get(FEED_URL, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const data = Buffer.concat(chunks);
                resolve(data);
            });
            res.on('error', reject);
        });
    });
}

async function run() {
    try {
        const buffer = await fetchFeed();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

        console.log(`Entities: ${feed.entity.length}`);

        feed.entity.forEach(entity => {
            if (entity.tripUpdate) {
                const trip = entity.tripUpdate.trip;
                const stops = entity.tripUpdate.stopTimeUpdate || [];

                const visits87 = stops.some(s => String(s.stopId) === '87');

                if (visits87) {
                    console.log(`\n=== TRIP ${trip.tripId} (Visits 87) ===`);
                    stops.forEach((s, idx) => {
                        console.log(`  Stop ${idx}: ID=${s.stopId} Seq=${s.stopSequence} Arr=${s.arrival?.time} Dep=${s.departure?.time}`);
                    });
                }
            }
        });

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
