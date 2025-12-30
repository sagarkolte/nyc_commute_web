
import { MtaService } from '../src/lib/mta';
import * as protobuf from 'protobufjs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;

async function verify() {
    console.log('--- Verifying Rail Track Integration ---');

    const protoPath = path.join(__dirname, '../src/lib/proto');
    const root = await protobuf.load([
        path.join(protoPath, 'gtfs-realtime.proto'),
        path.join(protoPath, 'gtfs-realtime-MTARR.proto')
    ]);
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

    // Test LIRR
    console.log('\nTesting LIRR Fetch (Grand Central Madison)...');
    try {
        const res = await MtaService.fetchFeed('LIRR', API_KEY, '349', true);
        if (res.type === 'gtfs-raw') {
            const decoded = FeedMessage.decode(new Uint8Array(res.data)) as any;
            let foundTrack = false;
            decoded.entity.forEach((entity: any) => {
                if (entity.tripUpdate?.stopTimeUpdate) {
                    entity.tripUpdate.stopTimeUpdate.forEach((stu: any) => {
                        const extKey = '.transit_realtime.mtaRailroadStopTimeUpdate';
                        const ext = stu[extKey] || stu.mtaRailroadStopTimeUpdate || stu.mta_railroad_stop_time_update;
                        if (ext?.track) {
                            console.log(`[PASS] Found Track: ${ext.track} for Trip: ${entity.tripUpdate.trip.tripId} at Stop: ${stu.stopId}`);
                            foundTrack = true;
                        }
                    });
                }
            });
            if (!foundTrack) console.log('[WARN] No active tracks found in current feed sample (normal if far from departure).');
        } else {
            console.error('[FAIL] Expected gtfs-raw response from MtaService');
        }
    } catch (e: any) {
        console.error('[ERROR] LIRR Verification failed:', e.message);
    }

    console.log('\n--- Verification Complete ---');
}

verify();
