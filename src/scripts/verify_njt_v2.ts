
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const NJT_V2_BASE_URL = 'https://pcsdata.njtransit.com/api/BUSDV2';

async function testV2() {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    console.log('Testing with user:', username);

    try {
        const formData = new URLSearchParams();
        formData.append('username', username!);
        formData.append('password', password!);

        const res = await axios.post(`${NJT_V2_BASE_URL}/authenticateUser`, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('Auth Response:', res.data);

        if (res.data.Authenticated === "True") {
            const token = res.data.UserToken;

            // Test getBusRoutes
            const routesForm = new URLSearchParams();
            routesForm.append('token', token);
            routesForm.append('mode', 'BUS');
            const routesRes = await axios.post(`${NJT_V2_BASE_URL}/getBusRoutes`, routesForm.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log('Routes Found:', routesRes.data.length);
            console.log('Sample Route:', routesRes.data[0]);

            // Test 158 specifically
            const dimsForm = new URLSearchParams();
            dimsForm.append('token', token);
            dimsForm.append('route', '158');
            const dimsRes = await axios.post(`${NJT_V2_BASE_URL}/getBusDirectionsData`, dimsForm.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log('158 Directions:', dimsRes.data);

            if (dimsRes.data[0]) {
                const dir = dimsRes.data[0].Direction_1;
                const stopsForm = new URLSearchParams();
                stopsForm.append('token', token);
                stopsForm.append('route', '158');
                stopsForm.append('direction', dir);
                stopsForm.append('namecontains', '');
                const stopsRes = await axios.post(`${NJT_V2_BASE_URL}/getStops`, stopsForm.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                console.log(`Stops for 158 (${dir}):`, stopsRes.data.length);
                console.log('Sample Stop:', stopsRes.data[0]);

                if (stopsRes.data[0]) {
                    const stopNum = stopsRes.data[0].busstopnumber;
                    const dvForm = new URLSearchParams();
                    dvForm.append('token', token);
                    dvForm.append('stop', stopNum);
                    dvForm.append('route', '158');
                    dvForm.append('direction', dir);
                    dvForm.append('IP', '');
                    const dvRes = await axios.post(`${NJT_V2_BASE_URL}/getBusDV`, dvForm.toString(), {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    console.log('Real-time Arrivals:', dvRes.data);
                }
            }
        }
    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) console.error('Data:', e.response.data);
    }
}

testV2();
