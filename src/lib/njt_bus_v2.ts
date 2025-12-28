
import axios from 'axios';

const NJT_V2_BASE_URL = 'https://pcsdata.njtransit.com/api/BUSDV2';

let cachedBusToken: string | null = null;
let busTokenExpiry: number = 0;

export interface NjtBusV2Stop {
    busstopdescription: string;
    busstopnumber: string;
}

export interface NjtBusV2Departure {
    public_route: string;
    header: string;
    departuretime: string; // e.g. "in 18 mins" or "12:50 PM"
    sched_dep_time: string;
    internal_trip_number: string;
    vehicle_id: string | null;
}

async function getBusV2Token(): Promise<string | null> {
    if (cachedBusToken && Date.now() < busTokenExpiry) {
        return cachedBusToken;
    }

    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!username || !password) {
        console.error('NJT_USERNAME or NJT_PASSWORD not set');
        return null;
    }

    try {
        // NJT V2 requires multipart/form-data for these POST calls
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const res = await axios.post(`${NJT_V2_BASE_URL}/authenticateUser`, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (res.data && res.data.Authenticated === "True" && res.data.UserToken) {
            cachedBusToken = res.data.UserToken;
            busTokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // Cache for 23 hours
            console.log('Refreshed NJT Bus V2 Token');
            return cachedBusToken;
        } else {
            console.error('NJT Bus V2 Auth Failed:', res.data);
        }
    } catch (error: any) {
        console.error('Failed to get NJT Bus V2 Token:', error.message);
    }
    return null;
}

export const NjtBusV2Service = {
    async getBusRoutes(mode: string = "BUS") {
        const token = await getBusV2Token();
        if (!token) return [];
        try {
            const formData = new URLSearchParams();
            formData.append('token', token);
            formData.append('mode', mode);
            const res = await axios.post(`${NJT_V2_BASE_URL}/getBusRoutes`, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return res.data || [];
        } catch (e) {
            console.error('V2 getBusRoutes error:', e);
            return [];
        }
    },

    async getBusDirections(route: string) {
        const token = await getBusV2Token();
        if (!token) return [];
        try {
            const formData = new URLSearchParams();
            formData.append('token', token);
            formData.append('route', route);
            const res = await axios.post(`${NJT_V2_BASE_URL}/getBusDirectionsData`, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            if (res.data && res.data[0]) {
                const directions = res.data[0];
                return [directions.Direction_1, directions.Direction_2].filter(Boolean);
            }
            return [];
        } catch (e) {
            console.error('V2 getBusDirections error:', e);
            return [];
        }
    },

    async getStops(route: string, direction: string) {
        const token = await getBusV2Token();
        if (!token) return [];
        try {
            const formData = new URLSearchParams();
            formData.append('token', token);
            formData.append('route', route);
            formData.append('direction', direction);
            formData.append('namecontains', '');
            const res = await axios.post(`${NJT_V2_BASE_URL}/getStops`, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return res.data || [];
        } catch (e) {
            console.error('V2 getStops error:', e);
            return [];
        }
    },

    async getArrivals(stop: string, route: string = '', direction: string = ''): Promise<NjtBusV2Departure[]> {
        const token = await getBusV2Token();
        if (!token) return [];
        try {
            const formData = new URLSearchParams();
            formData.append('token', token);
            formData.append('stop', stop);
            formData.append('route', route);
            formData.append('direction', direction);
            formData.append('IP', '');

            const res = await axios.post(`${NJT_V2_BASE_URL}/getBusDV`, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (res.data && res.data.DVTrip) {
                return res.data.DVTrip;
            }
            return [];
        } catch (e) {
            console.error('V2 getArrivals error:', e);
            return [];
        }
    },

    parseMinutes(departureTime: string): number {
        // NJT returns "in 18 mins", "in 2 mins", "APPROACHING", "12:50 PM"
        const clean = departureTime.toLowerCase().trim();
        if (clean.includes('approaching')) return 0;
        if (clean.includes('in ')) {
            const match = clean.match(/in (\d+) mins/);
            if (match) return parseInt(match[1], 10);
        }

        // If it's a timestamp "12:50 PM"
        if (clean.includes(':')) {
            try {
                const now = new Date();
                // Estimate date context (today)
                const [time, period] = clean.split(' ');
                let [hours, minutes] = time.split(':').map(Number);

                if (period === 'pm' && hours < 12) hours += 12;
                if (period === 'am' && hours === 12) hours = 0;

                const depDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

                // If the departure time is earlier than now, it might be for tomorrow (late night runs)
                // but usually NJT Bus DV only shows upcoming same-day or very next few hours.
                if (depDate.getTime() < now.getTime() - 30 * 60 * 1000) { // More than 30 mins ago
                    depDate.setDate(depDate.getDate() + 1);
                }

                const diffMs = depDate.getTime() - now.getTime();
                return Math.max(0, Math.floor(diffMs / (1000 * 60)));
            } catch (e) {
                return 99;
            }
        }
        return 0;
    }
};
