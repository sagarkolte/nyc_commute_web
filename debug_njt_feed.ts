
import axios from 'axios';
import FormData from 'form-data';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'; // Verify this import path
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugFeed() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!username || !password) {
        console.error("Missing credentials");
        return;
    }

    try {
        // 1. Authenticate
        console.log('Authenticating...');
        const form = new FormData();
        form.append('username', username);
        form.append('password', password);

        const authRes = await axios.post('https://pcsdata.njtransit.com/api/GTFS/authenticateUser', form, {
            headers: form.getHeaders()
        });

        const token = authRes.data.UserToken;
        console.log('Got token:', token ? 'YES' : 'NO');

        // 2. Fetch Feed
        console.log('Fetching TripUpdates...');
        const feedForm = new FormData();
        feedForm.append('token', token);

        const response = await axios.post('https://pcsdata.njtransit.com/api/GTFS/getTripUpdates', feedForm, {
            headers: feedForm.getHeaders(),
            responseType: 'arraybuffer'
        });

        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));
        console.log(`Feed contains ${feed.entity.length} entities.`);

        // 3. Filter for Route 158
        const route158 = feed.entity.filter(e => e.tripUpdate?.trip?.routeId === '158');
        console.log(`Found ${route158.length} updates for Route 158.`);

        if (route158.length > 0) {
            const sample = route158[0];
            console.log('Sample Trip:', JSON.stringify(sample.tripUpdate, null, 2));

            // Log all stop IDs for this trip to check format
            if (sample.tripUpdate?.stopTimeUpdate) {
                console.log('Stop IDs in this trip:');
                sample.tripUpdate.stopTimeUpdate.forEach(stu => {
                    console.log(` - StopID: ${stu.stopId} (Seq: ${stu.stopSequence})`);
                });
            }
        } else {
            // Check ANY bus to see if feed is working
            const anyBus = feed.entity.find(e => e.tripUpdate);
            if (anyBus) {
                console.log('Sample Random Bus Route:', anyBus.tripUpdate?.trip.routeId);
            }
        }

    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', e.response.data.toString());
        }
    }
}

debugFeed();
