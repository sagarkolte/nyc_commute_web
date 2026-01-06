
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

async function testV2() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    // We try to get a token. If it fails due to rate limit, we report it.
    let token;
    try {
        const tRes = await axios.post('https://raildata.njtransit.com/api/TrainData/getToken',
            `username=${username}&password=${password}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        token = tRes.data.UserToken;
    } catch (e) {
        console.log("Token limit likely reached:", e.response?.data || e.message);
        // If we can't get a token, we can't test.
        return;
    }

    const stationCode = 'NP';
    const params = `username=${username}&password=${password}&token=${token}&station=${stationCode}`;

    try {
        console.log("Testing getScheduleWithStops...");
        const res = await axios.post(`${NJT_BASE_URL}/getScheduleWithStops`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log("Response Keys:", Object.keys(res.data));
        if (res.data.ITEMS) {
            console.log("Items found:", res.data.ITEMS.length);
            console.log("First item:", JSON.stringify(res.data.ITEMS[0]).substring(0, 500));
        }
    } catch (e) {
        console.error("Endpoint failed:", e.response?.status, e.response?.data || e.message);
    }
}

testV2();
