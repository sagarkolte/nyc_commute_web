
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config({ path: '.env.local' });

const USERNAME = process.env.NJT_USERNAME;
const PASSWORD = process.env.NJT_PASSWORD;

async function testJsonApi() {
    // 1. Get Token from TestRailData
    const tokenUrl = 'https://testraildata.njtransit.com/api/GTFSRT/getToken';
    const form = new URLSearchParams();
    form.append('username', USERNAME);
    form.append('password', PASSWORD);

    let token;
    try {
        // Did the user mean api/TrainData/getToken or api/GTFSRT/getToken? 
        // Their curl said api/GTFSRT/getToken. I'll use that.
        // But for getScheduleWithStops (legacy), usually it expects a token from the legacy auth?
        // Let's try utilizing the token we get from GTFSRT/getToken for getScheduleWithStops.

        // Note: The curl output showed success using `multipart/form-data` and `-F`.
        // Axios serializing params is urlencoded. Let's see if TestRailData accepts it.
        // Previously my script used `exec(curl)` which worked.
        // To be safe, I'll assume I have a valid token (I can just hardcode the one I got if I want, but it might expire).
        // I will use axios with urlencoded, if it fails, I'll know.

        const res = await axios.post(tokenUrl, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        token = res.data.UserToken;
        console.log("Got Token:", token);
    } catch (e) {
        console.error("Token Fetch Failed:", e.message);
        return;
    }

    // 2. Try getScheduleWithStops on TestRailData
    // Is the endpoint `https://testraildata.njtransit.com/api/TrainData/getScheduleWithStops`?
    // Or `https://testraildata.njtransit.com/api/TrainData/getScheduleWithStops`?
    // Let's guess it mirrors Prod.
    const apiUrl = 'https://testraildata.njtransit.com/api/TrainData/getScheduleWithStops';

    console.log(`Hitting ${apiUrl}...`);
    const params = new URLSearchParams();
    params.append('username', USERNAME);
    params.append('password', PASSWORD);
    params.append('token', token);
    params.append('station', 'SM'); // Somerville

    try {
        const res = await axios.post(apiUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (res.data && res.data.ITEMS) {
            console.log(`Success! Found ${res.data.ITEMS.length} items.`);
            console.log(JSON.stringify(res.data.ITEMS[0], null, 2));
        } else {
            console.log("Response OK but no items:", res.data);
        }
    } catch (e) {
        console.error("API Call Failed:", e.message);
        if (e.response) console.error("Status:", e.response.status);
    }
}

testJsonApi();
