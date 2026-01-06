
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function test() {
    const apiKey = process.env.MTA_API_KEY;
    const stopId = '401234'; // Sample M23 stop? No, let's find a real one.
    // M23-SBS stop: W 23 ST/7 AV is 400438
    const testStop = '400438'; 
    const url = `http://bustime.mta.info/api/siri/stop-monitoring.json?key=${apiKey}&MonitoringRef=${testStop}&version=2`;

    console.log('Testing MTA Bus API with key:', apiKey?.substring(0, 5) + '...');
    try {
        const res = await axios.get(url);
        console.log('Success!', JSON.stringify(res.data).substring(0, 200));
    } catch (e) {
        console.error('Failed:', e.response?.status, e.response?.data || e.message);
    }
}

test();
