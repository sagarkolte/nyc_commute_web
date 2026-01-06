
import { MtaService } from '../src/lib/mta.ts';
import { CommuteStorage } from '../src/lib/storage.ts';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    console.log('--- Verifying Bus Search Fix ---');
    const apiKey = process.env.MTA_BUS_API_KEY;
    if (!apiKey) {
        console.error('No API Key found in env');
        return;
    }

    // Test 1: Search for "Q115" (The reported missing route)
    console.log('\n1. Searching for "Q115"...');
    try {
        const routes = await MtaService.searchBusRoutes('Q115', apiKey);
        console.log(`Found ${routes.length} routes.`);
        routes.forEach(r => console.log(` - ${r.shortName} (${r.id}): ${r.longName}`));

        const targetRoute = routes.find(r => r.shortName === 'Q115');
        if (targetRoute) {
            console.log('SUCCESS: Q115 found!');

            // Test 2: Fetch Stops for Q115
            console.log(`\n2. Fetching stops for routeId: ${targetRoute.id}...`);
            const stops = await MtaService.getBusStops(targetRoute.id, apiKey);
            console.log(`Found ${stops.length} stops.`);
            if (stops.length > 0) {
                console.log(`Sample Stop: ${stops[0].name}`);
                console.log('SUCCESS: Stops fetched.');
            } else {
                console.error('FAILURE: No stops fetched.');
            }
        } else {
            console.error('FAILURE: Q115 NOT found in search results.');
        }

    } catch (e) {
        console.error('Error during verification:', e);
    }
}

verify();
