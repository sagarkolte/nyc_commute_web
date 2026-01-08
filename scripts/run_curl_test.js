
const { exec } = require('child_process');
require('dotenv').config({ path: '.env.local' });

const USERNAME = process.env.NJT_USERNAME;
const PASSWORD = process.env.NJT_PASSWORD;

function runCurlSequence() {
    if (!USERNAME || !PASSWORD) {
        console.error("Missing credentials");
        return;
    }

    console.log("1. Fetching Token from TEST Env...");
    // Assume we use the previous token fetching logic or just fetch new
    const getTokenCmd = `curl -s -X POST 'https://testraildata.njtransit.com/api/GTFSRT/getToken' \
    -H 'accept: text/plain' \
    -H 'Content-Type: multipart/form-data' \
    -F 'username=${USERNAME}' \
    -F 'password=${PASSWORD}'`;

    exec(getTokenCmd, (error, stdout, stderr) => {
        if (error) { console.error(error); return; }
        let token = stdout.trim();
        try {
            const json = JSON.parse(stdout);
            if (json.UserToken) token = json.UserToken;
        } catch (e) { }

        console.log("Got Token:", token.substring(0, 10) + "...");

        console.log("\n2. Fetching getGTFS (Static Zip)...");

        // Output to a file so we don't spam logs
        const getGtfsCmd = `curl -X POST 'https://testraildata.njtransit.com/api/GTFSRT/getGTFS' \
        -H 'accept: */*' \
        -H 'Content-Type: multipart/form-data' \
        -F 'token=${token}' \
        --output njt_gtfs.zip`;

        exec(getGtfsCmd, (err, out, serr) => {
            // check if file exists and size
            const fs = require('fs');
            try {
                const stats = fs.statSync('njt_gtfs.zip');
                console.log(`Success? File size: ${stats.size} bytes`);
            } catch (e) {
                console.log("Failed to download file.");
            }
            if (serr) console.error("stderr (curl stats):", serr);
        });
    });
}
runCurlSequence();
