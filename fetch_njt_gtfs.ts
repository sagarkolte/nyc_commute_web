
import axios from 'axios';
import FormData from 'form-data';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip'; // I'll need to install this or use standard libs if possible, but zip handling in node requires a lib usually.
// Actually, I can just save the zip and run `unzip -l` with run_command.

dotenv.config({ path: '.env.local' });

async function fetchGtfs() {
    // 1. Auth (Reuse logic or just copy token if valid, but better to auth)
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    // Auth
    const authForm = new FormData();
    authForm.append('username', username);
    authForm.append('password', password);
    const authRes = await axios.post('https://pcsdata.njtransit.com/api/GTFS/authenticateUser', authForm, { headers: authForm.getHeaders() });
    const token = authRes.data.UserToken;
    console.log('Token:', token);

    // 2. Fetch GTFS Zip
    const gtfsForm = new FormData();
    gtfsForm.append('token', token);

    console.log('Downloading GTFS Zip...');
    const response = await axios.post('https://pcsdata.njtransit.com/api/GTFS/getGTFS', gtfsForm, {
        headers: gtfsForm.getHeaders(),
        responseType: 'arraybuffer'
    });

    const zipPath = path.join(process.cwd(), 'njt_bus_data.zip');
    fs.writeFileSync(zipPath, response.data);
    console.log(`Saved zip to ${zipPath} (${response.data.length} bytes)`);
}

fetchGtfs();
