
import axios from 'axios';
import njtStations from './njt_stations.json';

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

// Cache token in a way that survives some serverless warm starts
const globalAny = global as any;
const tokenCache = globalAny._njt_rail_token || { token: null, expiry: 0 };

async function getNjtToken(): Promise<string | null> {
    if (tokenCache.token && Date.now() < tokenCache.expiry) {
        return tokenCache.token;
    }

    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!username || !password) {
        console.error('NJT_USERNAME or NJT_PASSWORD not set');
        return null;
    }

    const endpoints = [
        'https://raildata.njtransit.com/api/TrainData/getToken',
        'https://railservice.njtransit.com/api/getToken'
    ];

    for (const url of endpoints) {
        try {
            console.log(`[NJT] Attempting getToken at: ${url}`);
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);

            const res = await axios.post(url, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000 // 10s timeout
            });

            if (res.data && res.data.UserToken) {
                tokenCache.token = res.data.UserToken;
                tokenCache.expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours
                globalAny._njt_rail_token = tokenCache;
                console.log(`[NJT] Refreshed NJT Token via ${url}`);
                return tokenCache.token;
            }
        } catch (error: any) {
            console.warn(`[NJT] Failed to get NJT Token from ${url}:`, error.response?.status || error.message);
        }
    }
    return null;
}

export interface NjtDeparture {
    train_id: string;
    line: string;
    destination: string;
    track: string;
    time: string; // SCHED_DEP_DATE
    status: string;
    stops?: any[];
}

export async function getNjtDepartures(stationCode: string): Promise<NjtDeparture[]> {
    const token = await getNjtToken();
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!token) {
        console.warn(`[NJT] Token fetch failed for ${stationCode}. Returning generic MOCK data.`);

        const station = (njtStations as any[]).find(s => s.id === stationCode);
        const stationName = station ? station.name : stationCode;

        const now = new Date();
        const baseMin = now.getMinutes() < 30 ? 30 : 60;

        const m1 = new Date(now); m1.setMinutes(baseMin + 5);
        const m2 = new Date(now); m2.setMinutes(baseMin + 25);
        const m3 = new Date(now); m3.setMinutes(baseMin + 45);

        return [
            {
                train_id: 'MOCK-1',
                line: 'Transit Pulse Recovery',
                destination: 'New York Penn Station',
                track: '-',
                time: m1.toISOString(),
                status: 'SCHEDULED'
            },
            {
                train_id: 'MOCK-2',
                line: 'Transit Pulse Recovery',
                destination: 'Newark Penn Station',
                track: '-',
                time: m2.toISOString(),
                status: 'SCHEDULED'
            },
            {
                train_id: 'MOCK-3',
                line: 'Transit Pulse Recovery',
                destination: 'Hoboken Terminal',
                track: '-',
                time: m3.toISOString(),
                status: 'SCHEDULED'
            }
        ];
    }

    if (!username || !password) {
        return [];
    }

    try {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        params.append('token', token);
        params.append('station', stationCode);

        const res = await axios.post(`${NJT_BASE_URL}/getTrainSchedule`, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (res.data && res.data.ITEMS) {
            return res.data.ITEMS.map((item: any) => ({
                train_id: item.TRAIN_ID,
                line: item.LINE,
                destination: item.DESTINATION,
                track: item.TRACK,
                time: parseNjtDate(item.SCHED_DEP_DATE).toISOString(),
                status: item.STATUS,
                stops: item.STOPS
            }));
        }
    } catch (error: any) {
        console.error(`NJT Fetch Error (${stationCode}):`, error.message);
    }

    return [];
}

// Helper to parse NJT Date string (e.g. "19-Dec-2025 07:46:00 AM") as America/New_York
export function parseNjtDate(dateStr: string): Date {
    // 1. naive parse as UTC
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return new Date(); // Fallback

    // 2. NJT is always Eastern Time. 
    // If the server parsed '7:46 AM' as UTC, the epoch is 7:46 UTC.
    // Real time 7:46 EST is 12:46 UTC.
    // So we need to ADD the offset (5 hours or 4 hours).

    // Simple EST handling (Standard Time is UTC-5)
    // TODO: Handle DST dynamically if needed, though for now Dec is Standard.
    const isDst = false; // Dec is Standard
    const offsetHours = isDst ? 4 : 5;

    return new Date(date.getTime() + (offsetHours * 60 * 60 * 1000));
}
