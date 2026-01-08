
const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const USERNAME = process.env.NJT_USERNAME;
const PASSWORD = process.env.NJT_PASSWORD;

async function fetchMapping() {
    // 1. Get Token (Legacy Prod)
    const tokenUrl = 'https://raildata.njtransit.com/api/TrainData/getToken';
    const form = new URLSearchParams();
    form.append('username', USERNAME);
    form.append('password', PASSWORD);

    let token;
    try {
        const tr = await axios.post(tokenUrl, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        token = tr.data.UserToken; // or .token? Validating response structure
        if (!token) token = tr.data; // Sometimes it's direct string?
    } catch (e) {
        console.error("Token Fetch Failed:", e.message);
        return;
    }

    // 2. Get Station List
    console.log("Fetching Station List...");
    const apiUrl = 'https://raildata.njtransit.com/api/TrainData/getStationList';
    const params = new URLSearchParams();
    params.append('username', USERNAME);
    params.append('password', PASSWORD);
    params.append('token', token);

    try {
        const res = await axios.post(apiUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (res.data && res.data.STATION) {
            console.log(`Got ${res.data.STATION.length} stations.`);
            console.log("Sample 1:", JSON.stringify(res.data.STATION[0]));

            // Check if we have both IDs
            // Expecting something like STATION_ID (numeric) and STATION_2CHAR (alpha)

            // Save to file for inspection
            fs.writeFileSync('njt_stations_raw.json', JSON.stringify(res.data.STATION, null, 2));
            console.log("Saved to njt_stations_raw.json");
        } else {
            console.log("No STATION data found:", res.data);
        }
    } catch (e) {
        console.error("Station List Fetch Failed:", e.message);
    }
}

fetchMapping();
