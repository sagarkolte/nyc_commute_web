const { GET } = require('../src/app/api/mta/route');

async function testIndirect() {
    // Mock Request for East River at Pier 11
    console.log("Testing API route for East River @ Pier 11...");
    const req = {
        url: 'http://localhost:3000/api/mta?routeId=East%20River&stopId=87&direction=N'
    };

    try {
        const res = await GET(req);
        const data = await res.json();
        console.log("Status:", res.status || 200);
        console.log("Arrivals Found:", data.arrivals?.length);
        if (data.arrivals?.length > 0) {
            console.log("Sample Arrival:", JSON.stringify(data.arrivals[0], null, 2));
            console.log("Destinations:", data.arrivals.map((a: any) => `${a.time} -> ${a.destination}`));
        } else {
            console.log("Debug Info:", JSON.stringify(data.debugInfo, null, 2));
        }
    } catch (e) {
        console.error("Test Error:", e);
    }
}

testIndirect().catch(console.error);
