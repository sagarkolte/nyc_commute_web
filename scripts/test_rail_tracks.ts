
import axios from 'axios';
import * as protobuf from 'protobufjs';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
const LIRR_FEED = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';

async function testFeed() {
    console.log(`\n=== Finding Track 304 in LIRR ===`);
    try {
        const root = await protobuf.load([
            path.join(__dirname, 'proto/gtfs-realtime.proto'),
            path.join(__dirname, 'proto/gtfs-realtime-MTARR.proto')
        ]);

        const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

        const res = await axios.get(LIRR_FEED, {
            headers: { 'x-api-key': API_KEY },
            responseType: 'arraybuffer'
        });

        const message = FeedMessage.decode(new Uint8Array(res.data)) as any;
        const entities = message.entity || [];

        console.log(`Fetched ${entities.length} entities.`);

        entities.forEach((entity: any) => {
            const tu = entity.trip_update || entity.tripUpdate;
            if (tu) {
                const tripId = tu.trip?.tripId || tu.trip?.trip_id || '';
                const updates = tu.stop_time_update || tu.stopTimeUpdate || [];

                updates.forEach((stu: any) => {
                    const sid = stu.stop_id || stu.stopId;
                    const extKey = '.transit_realtime.mtaRailroadStopTimeUpdate';
                    const ext = stu[extKey] || stu.mtaRailroadStopTimeUpdate || stu.mta_railroad_stop_time_update;

                    const track = ext?.track || '';

                    if (track.includes('304') || sid === '99' || sid === '105' || tripId.includes('450')) {
                        console.log(`Trip: ${tripId}, Stop: ${sid}, Track: ${track || 'NONE'}`);
                    }
                });
            }
        });

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }
}

testFeed();
