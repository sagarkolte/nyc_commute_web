
import axios from 'axios';
import * as protobuf from 'protobufjs';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
const LIRR_FEED = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';
const MNR_FEED = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr';

async function testDestinationTime(feedUrl: string, name: string) {
    console.log(`\n=== Testing Destination Arrival Time for ${name} ===`);
    try {
        const root = await protobuf.load([
            path.join(__dirname, 'proto/gtfs-realtime.proto'),
            path.join(__dirname, 'proto/gtfs-realtime-MTARR.proto')
        ]);

        const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

        const res = await axios.get(feedUrl, {
            headers: { 'x-api-key': API_KEY },
            responseType: 'arraybuffer'
        });

        const message = FeedMessage.decode(new Uint8Array(res.data)) as any;
        const entities = message.entity || [];

        console.log(`Fetched ${entities.length} entities from ${name}.`);

        // We'll pick one trip that has multiple stopTimeUpdates to see the breadth
        let sampleTrip: any = null;
        for (const entity of entities) {
            const tu = entity.trip_update || entity.tripUpdate;
            if (tu && tu.stopTimeUpdate && tu.stopTimeUpdate.length > 5) {
                sampleTrip = tu;
                break;
            }
        }

        if (sampleTrip) {
            console.log(`\nSample Trip ID: ${sampleTrip.trip.tripId}`);
            console.log(`Route ID: ${sampleTrip.trip.routeId}`);
            console.log(`Number of StopTimeUpdates: ${sampleTrip.stopTimeUpdate.length}`);

            sampleTrip.stopTimeUpdate.forEach((stu: any, index: number) => {
                const sid = stu.stopId || stu.stop_id;
                const arrival = stu.arrival?.time || stu.arrival?.time?.low || 'N/A';
                const departure = stu.departure?.time || stu.departure?.time?.low || 'N/A';
                const arrivalStr = arrival !== 'N/A' ? new Date(Number(arrival) * 1000).toLocaleTimeString() : 'N/A';

                console.log(`[${index}] Stop: ${sid}, Arrival: ${arrivalStr} (${arrival})`);
            });

            const firstStop = sampleTrip.stopTimeUpdate[0];
            const lastStop = sampleTrip.stopTimeUpdate[sampleTrip.stopTimeUpdate.length - 1];

            console.log(`\nTrip Span: ${firstStop.stopId} -> ${lastStop.stopId}`);
            if (firstStop.arrival?.time && lastStop.arrival?.time) {
                const durationMinutes = (Number(lastStop.arrival.time) - Number(firstStop.arrival.time)) / 60;
                console.log(`Total duration in feed: ${durationMinutes.toFixed(1)} minutes`);
            }
        } else {
            console.log('No trip with > 5 stop updates found in this feed sample.');
        }

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }
}

async function run() {
    await testDestinationTime(LIRR_FEED, 'LIRR');
    await testDestinationTime(MNR_FEED, 'MNR');
}

run();
