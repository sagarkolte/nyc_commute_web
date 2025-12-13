
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';


const FEED_URL = 'https://path.transitdata.nyc/gtfsrt';

async function main() {
    try {
        const response = await fetch(FEED_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

        const stopIds = new Set<string>();
        const routes = new Set<string>();

        feed.entity.forEach((entity) => {
            if (entity.tripUpdate) {
                if (entity.tripUpdate.trip.routeId) {
                    routes.add(entity.tripUpdate.trip.routeId);
                }
                entity.tripUpdate.stopTimeUpdate?.forEach((update) => {
                    if (update.stopId) {
                        stopIds.add(update.stopId);
                    }
                });
            }
        });

        console.log('Routes:', Array.from(routes));
        console.log('Stop IDs:', Array.from(stopIds));

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
