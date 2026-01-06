
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

async function getNjtToken() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    const url = 'https://raildata.njtransit.com/api/TrainData/getToken';

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);

    const res = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.UserToken;
}

async function diagnose() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    const token = await getNjtToken();
    const stationCode = 'NP'; // Newark Penn

    console.log(`Diagnosing NJT for station: ${stationCode}`);

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    params.append('token', token);
    params.append('station', stationCode);

    const res = await axios.post(`${NJT_BASE_URL}/getTrainSchedule`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (res.data && res.data.ITEMS) {
        console.log(`Found ${res.data.ITEMS.length} trains.`);
        const somervilleTrains = res.data.ITEMS.filter(item => {
            const hasStop = item.STOPS && item.STOPS.some(s => s.STATION_2CHAR === 'SM');
            const destMatch = item.DESTINATION.toLowerCase().includes('somerville');
            return hasStop || destMatch;
        });

        console.log(`Trains with Somerville stop/dest: ${somervilleTrains.length}`);
        somervilleTrains.forEach(t => {
            console.log(`- Train ${t.TRAIN_ID} to ${t.DESTINATION} at ${t.SCHED_DEP_DATE}. Stops: ${t.STOPS?.map(s => s.STATION_2CHAR).join(', ')}`);
        });

        if (somervilleTrains.length === 0 && res.data.ITEMS.length > 0) {
            console.log("Sample train from result:");
            const sample = res.data.ITEMS[0];
            console.log(`- Train ${sample.TRAIN_ID} to ${sample.DESTINATION}. Stops: ${sample.STOPS?.map(s => s.STATION_2CHAR).join(', ')}`);
        }
    } else {
        console.log("No ITEMS found in response:", res.data);
    }
}

diagnose();
