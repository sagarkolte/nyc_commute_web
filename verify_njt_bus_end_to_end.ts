
import axios from 'axios';

async function verify() {
    // 17057 = Found in logs
    const stopId = '17057';
    const url = `http://localhost:3001/api/njt-bus?stopId=${stopId}`;
    console.log(`Fetching ${url}...`);

    try {
        const res = await axios.get(url);
        console.log('Status:', res.status);
        if (res.data.arrivals) {
            console.log(`Found ${res.data.arrivals.length} arrivals.`);
            res.data.arrivals.forEach((a: any) => {
                console.log(`- ${new Date(a.time * 1000).toLocaleTimeString()} -> ${a.destination} [${a.routeId}]`);
            });
        } else {
            console.log('No arrivals field in response', res.data);
        }
    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) console.error('Data:', e.response.data);
    }
}
verify();
