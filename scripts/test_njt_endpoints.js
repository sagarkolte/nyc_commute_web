
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

    try {
        const res = await axios.post(url, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data.UserToken;
    } catch (e) {
        console.error('getToken failed:', e.response?.data || e.message);
        return null;
    }
}

async function testEndpoints() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    const token = await getNjtToken();
    if (!token) return;

    const stationCode = 'NP'; // Newark Penn
    const endpoints = ['getTrainSchedule', 'getScheduleWithStops'];

    for (const ep of endpoints) {
        console.log(`\nTesting endpoint: ${ep}`);
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        params.append('token', token);
        params.append('station', stationCode);

        try {
            const res = await axios.post(`${NJT_BASE_URL}/${ep}`, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log(`${ep} Success! Items: ${res.data?.ITEMS?.length || 0}`);
            if (res.data?.ITEMS?.length > 0) {
                const sample = res.data.ITEMS[0];
                console.log(`Sample: ${sample.DESTINATION} at ${sample.SCHED_DEP_DATE}`);
                console.log(`Has stops: ${!!sample.STOPS}`);
            }
        } catch (e) {
            console.error(`${ep} failed:`, e.response?.status, e.response?.data || e.message);
        }
    }
}

testEndpoints();
