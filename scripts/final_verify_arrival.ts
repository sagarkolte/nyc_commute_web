
import axios from 'axios';
import * as protobuf from 'protobufjs';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const API_KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
const LIRR_FEED = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';
const MNR_FEED = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr';
const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

async function verifyAll() {
    console.log('--- FINAL FEASIBILITY VERIFICATION ---');

    const root = await protobuf.load([
        path.join(__dirname, 'proto/gtfs-realtime.proto'),
        path.join(__dirname, 'proto/gtfs-realtime-MTARR.proto')
    ]);
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

    // 1. LIRR Verification
    console.log('\n[LIRR] Extracting Trip Details...');
    try {
        const res = await axios.get(LIRR_FEED, { headers: { 'x-api-key': API_KEY }, responseType: 'arraybuffer' });
        const message = FeedMessage.decode(new Uint8Array(res.data)) as any;
        const trip = (message.entity || []).find((e: any) => e.tripUpdate && e.tripUpdate.stopTimeUpdate.length > 5)?.tripUpdate;
        if (trip) {
            const start = trip.stopTimeUpdate[0];
            const end = trip.stopTimeUpdate[trip.stopTimeUpdate.length - 1];
            console.log(`Trip: ${trip.trip.tripId}`);
            console.log(`From: StopID ${start.stopId} at ${new Date(Number(start.arrival?.time || start.departure?.time) * 1000).toLocaleTimeString()}`);
            console.log(`To:   StopID ${end.stopId} at ${new Date(Number(end.arrival?.time) * 1000).toLocaleTimeString()}`);
        }
    } catch (e: any) { console.error('LIRR Error:', e.message); }

    // 2. MNR Verification
    console.log('\n[MNR] Extracting Trip Details...');
    try {
        const res = await axios.get(MNR_FEED, { headers: { 'x-api-key': API_KEY }, responseType: 'arraybuffer' });
        const message = FeedMessage.decode(new Uint8Array(res.data)) as any;
        const trip = (message.entity || []).find((e: any) => e.tripUpdate && e.tripUpdate.stopTimeUpdate.length > 5)?.tripUpdate;
        if (trip) {
            const start = trip.stopTimeUpdate[0];
            const end = trip.stopTimeUpdate[trip.stopTimeUpdate.length - 1];
            console.log(`Trip: ${trip.trip.tripId}`);
            console.log(`From: StopID ${start.stopId} at ${new Date(Number(start.arrival?.time || start.departure?.time) * 1000).toLocaleTimeString()}`);
            console.log(`To:   StopID ${end.stopId} at ${new Date(Number(end.arrival?.time) * 1000).toLocaleTimeString()}`);
        }
    } catch (e: any) { console.error('MNR Error:', e.message); }

    // 3. NJT Verification
    console.log('\n[NJT] Extracting Trip Details...');
    try {
        const username = process.env.NJT_USERNAME;
        const password = process.env.NJT_PASSWORD;
        const tRes = await axios.post(`${NJT_BASE_URL}/getToken`, new URLSearchParams({ username: username!, password: password! }).toString());
        const token = tRes.data.UserToken;
        const sRes = await axios.post(`${NJT_BASE_URL}/getTrainSchedule`, new URLSearchParams({ username: username!, password: password!, token: token, station: 'NY' }).toString());
        const train = (sRes.data.ITEMS || []).find((t: any) => t.STOPS && t.STOPS.length > 0);
        if (train) {
            const lastStop = train.STOPS[train.STOPS.length - 1];
            console.log(`Train: ${train.TRAIN_ID} to ${train.DESTINATION}`);
            console.log(`Departs: ${train.SCHED_DEP_DATE}`);
            console.log(`Arrives: ${lastStop.STATIONNAME} at ${lastStop.TIME}`);
        }
    } catch (e: any) { console.error('NJT Error:', e.message); }

    console.log('\n--- VERIFICATION COMPLETE ---');
}

verifyAll();
