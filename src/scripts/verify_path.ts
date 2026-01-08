
import { MtaService } from '../lib/mta';

// Mock specific parts if needed, or just run it as an integration test if files are self-contained.
// MtaService uses fetch, which is available globally in Node 18+.

async function verifyPath() {
    console.log('Fetching PATH feed...');
    try {
        const feedResponse = await MtaService.fetchFeed('PATH', undefined, '26731');
        if (feedResponse.type !== 'gtfs' || !('entity' in feedResponse.data)) {
            console.log(`Skipping: Feed type is ${feedResponse.type}`);
            return;
        }
        const feed = feedResponse.data;
        const now = Date.now() / 1000;

        console.log(`Feed entities count: ${feed.entity.length}`);

        const arrivals: any[] = [];
        const stopId = '26731'; // Journal Square

        feed.entity.forEach((entity: any) => {
            if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate: any) => {
                    if (stopUpdate.stopId === stopId) {
                        const arrivalTime = stopUpdate.arrival?.time?.low || stopUpdate.departure?.time?.low;
                        if (arrivalTime && arrivalTime > now) {
                            arrivals.push({
                                routeId: entity.tripUpdate.trip.routeId,
                                time: arrivalTime,
                                minutesUntil: Math.floor((arrivalTime - now) / 60)
                            });
                        }
                    }
                });
            }
        });

        console.log('Upcoming arrivals at Journal Square:', arrivals.sort((a, b) => a.time - b.time));

    } catch (e) {
        console.error('Error:', e);
    }
}

verifyPath();
