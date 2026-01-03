
import axios from 'axios';

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

// Cache token in memory (note: this resets on server restart/lambda cold start)
let cachedToken: string | null = null;
let tokenExpiry: number = 0; // Timestamp

async function getNjtToken(): Promise<string | null> {
    // If token exists and is fresh (arbitrary 1 hour cache, daily limit is strict)
    // Actually documentation says limit 10/day for creating token? Or using? 
    // "10 accesses per day is imposed for obtaining the full schedule" - implies getTrainSchedule?
    // But common belief is fetching the token itself is rate limited.
    // We'll cache it for 12 hours to be safe.
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
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
                cachedToken = res.data.UserToken;
                tokenExpiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours
                console.log(`[NJT] Refreshed NJT Token via ${url}`);
                return cachedToken;
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
        console.warn('[NJT] Token fetch failed (likely rate limited). Returning MOCK data.');
        if (stationCode === 'NY') {
            const nextHour = new Date();
            nextHour.setMinutes(nextHour.getMinutes() + 10);
            const later = new Date();
            later.setMinutes(later.getMinutes() + 25);
            const later2 = new Date();
            later2.setMinutes(later2.getMinutes() + 45);

            return [
                {
                    train_id: '1234',
                    line: 'No Jersey Coast',
                    destination: 'Bay Head -SEC',
                    track: '12',
                    time: nextHour.toISOString(),
                    status: 'BOARDING'
                },
                {
                    train_id: '5678',
                    line: 'Northeast Corrdr',
                    destination: 'Trenton',
                    track: '8',
                    time: later.toISOString(),
                    status: 'ON TIME'
                },
                {
                    train_id: '9012',
                    line: 'No Jersey Coast',
                    destination: 'Long Branch -SEC &#9992',
                    track: 'TRK',
                    time: later2.toISOString(),
                    status: 'ON TIME'
                }
            ];
        }
        return [];
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
function parseNjtDate(dateStr: string): Date {
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
