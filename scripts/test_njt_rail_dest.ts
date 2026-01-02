
import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

async function getNjtToken(): Promise<string | null> {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    if (!username || !password) return null;
    try {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        const res = await axios.post(`${NJT_BASE_URL}/getToken`, params.toString());
        return res.data?.UserToken || null;
    } catch (e) {
        return null;
    }
}

async function testNjtRail() {
    console.log(`\n=== Testing NJT Rail Destination Time ===`);
    const token = await getNjtToken();
    if (!token) {
        console.error('Failed to get NJT token');
        return;
    }

    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    // 1. Try getTrainSchedule for a major station
    console.log('\n--- getTrainSchedule (NY Penn) ---');
    try {
        const params = new URLSearchParams();
        params.append('username', username!);
        params.append('password', password!);
        params.append('token', token);
        params.append('station', 'NY');
        const res = await axios.post(`${NJT_BASE_URL}/getTrainSchedule`, params.toString());
        const items = res.data?.ITEMS || [];
        console.log(`Found ${items.length} departures.`);
        if (items.length > 0) {
            console.log('First departure sample:', JSON.stringify(items[0], null, 2));
            const trainId = items[0].TRAIN_ID;

            // 2. Try getTrainScheduleJSON or similar if it exists? Actually let's try getVehicleData
            console.log(`\n--- getVehicleData for Train ${trainId} ---`);
            const vParams = new URLSearchParams();
            vParams.append('username', username!);
            vParams.append('password', password!);
            vParams.append('token', token);
            // Some APIs allow filtering or specific calls.
            const vRes = await axios.post(`${NJT_BASE_URL}/getVehicleData`, vParams.toString());
            const vehicles = vRes.data?.ITEMS || [];
            const targetVehicle = vehicles.find((v: any) => v.TRAIN_ID === trainId);
            if (targetVehicle) {
                console.log('Vehicle data found for train:', JSON.stringify(targetVehicle, null, 2));
            } else {
                console.log(`Train ${trainId} not found in current vehicle data (maybe not active yet).`);
                if (vehicles.length > 0) {
                    console.log('Sample vehicle data:', JSON.stringify(vehicles[0], null, 2));
                }
            }
        }
    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }

    // 3. Check for GTFS-RT Rail if possible?
    // NJT Bus GTFS-RT URL: https://api.njtransit.com/gtfs-rt-proto/tripupdates
    // Is there a rail one? Usually NJT Rail isn't in GTFS-RT in the same way, but let's check.
}

testNjtRail();
