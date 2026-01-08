
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

require('dotenv').config({ path: '.env.local' });

const USERNAME = process.env.NJT_USERNAME;
const PASSWORD = process.env.NJT_PASSWORD;

async function inspectFeed() {
    if (!USERNAME || !PASSWORD) {
        console.error("Missing credentials");
        return;
    }

    // 1. Get Token
    console.log("Fetching Token...");
    const tokenParams = new URLSearchParams();
    tokenParams.append('username', USERNAME);
    tokenParams.append('password', PASSWORD);

    let token = '';
    try {
        const tr = await axios.post('https://testraildata.njtransit.com/api/GTFSRT/getToken', tokenParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        token = tr.data.UserToken;
    } catch (e: any) {
        console.error("Token fail:", e.message);
        return;
    }
    console.log("Got Token:", token.substring(0, 10));

    // 2. Fetch TripUpdates
    console.log("Fetching TripUpdates...");
    const feedParams = new URLSearchParams();
    feedParams.append('token', token);

    try {
        const res = await axios.post('https://testraildata.njtransit.com/api/GTFSRT/getTripUpdates', feedParams.toString(), {
            responseType: 'arraybuffer', // IMPORTANT for ProtoBuf
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log(`Received ${res.data.length} bytes.`);

        // 3. Decode
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(res.data));

        console.log(`Feed Header: v${feed.header.gtfsRealtimeVersion}, TS: ${feed.header.timestamp}`);
        console.log(`Entity Count: ${feed.entity.length}`);

        // 4. Sample Data
        const withStops = feed.entity.find(e => e.tripUpdate && e.tripUpdate.stopTimeUpdate && e.tripUpdate.stopTimeUpdate.length > 0);

        if (withStops && withStops.tripUpdate) {
            console.log("\n--- Sample Trip Update ---");
            const tu = withStops.tripUpdate;
            console.log(`Trip ID: ${tu.trip.tripId}`);
            console.log(`Route ID: ${tu.trip.routeId}`);

            if (tu.stopTimeUpdate) {
                console.log("Stops:");
                tu.stopTimeUpdate.slice(0, 5).forEach((stu: any) => {
                    console.log(`  Stop ID: ${stu.stopId}, Seq: ${stu.stopSequence}`);
                    if (stu.arrival) console.log(`    Arr: ${stu.arrival.time} (Delay: ${stu.arrival.delay})`);
                    if (stu.departure) console.log(`    Dep: ${stu.departure.time} (Delay: ${stu.departure.delay})`);
                });
            }
        } else {
            console.log("No trips with stop updates found?");
        }

    } catch (e: any) {
        console.error("Feed error:", e.message);
        if (e.response) console.error("Status:", e.response.status);
    }
}

inspectFeed();
