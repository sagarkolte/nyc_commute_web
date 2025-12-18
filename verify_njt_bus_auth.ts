
import axios from 'axios';
import FormData from 'form-data';

// Load env vars if running locally (next dev loads them, but standalone script needs help or manual string replacement if I don't use dotenv. 
// standard nextjs project structure usually allows process.env if running via ts-node with dotenv)
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verifyNjtBusAuth() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!username || !password) {
        console.error('Missing NJT_USERNAME or NJT_PASSWORD in .env.local');
        return;
    }

    // Endpoint from docs: https://pcsdata.njtransit.com/api/GTFS/authenticateUser
    // They mention both GTFSRT and GTFS. Let's try the one in the curl example.
    const authUrl = 'https://pcsdata.njtransit.com/api/GTFS/authenticateUser';

    console.log(`Authenticating to ${authUrl}...`);

    try {
        const form = new FormData();
        form.append('username', username);
        form.append('password', password);

        const res = await axios.post(authUrl, form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log('Status:', res.status);
        console.log('Data:', res.data);

        // If we get a token, try to list trips or verify we can hit another endpoint?
        // But the other endpoints return binary files (proto or zip).
        // Let's just confirm we get a token first.
    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response Data:', e.response.data);
            console.error('Response Status:', e.response.status);
        }
    }
}

verifyNjtBusAuth();
