import axios from 'axios';
import njtStations from './njt_stations.json';
import njtFallback from './njt_schedule_fallback.json';

const NJT_BASE_URL = 'https://raildata.njtransit.com/api/TrainData';

// Cache token in a way that survives some serverless warm starts
const globalAny = global as any;
const tokenCache = globalAny._njt_rail_token || { token: null, expiry: 0 };
let tokenPromise: Promise<string | null> | null = null;

async function getNjtToken(): Promise<string | null> {
    if (tokenCache.token && Date.now() < tokenCache.expiry) {
        return tokenCache.token;
    }

    // If a request is already in flight, wait for it
    if (tokenPromise) {
        console.log('[NJT] Waiting for existing token request...');
        return tokenPromise;
    }

    tokenPromise = (async () => {
        try {
            const result = await fetchNewToken();
            if (result) {
                tokenCache.token = result;
                tokenCache.expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours
                globalAny._njt_rail_token = tokenCache;
            }
            return result;
        } finally {
            tokenPromise = null;
        }
    })();

    return tokenPromise;
}

async function fetchNewToken(): Promise<string | null> {
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
                console.log(`[NJT] Refreshed NJT Token via ${url}`);
                return res.data.UserToken;
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

export async function getNjtDepartures(stationCode: string, destStopId?: string | null): Promise<NjtDeparture[]> {
    const token = await getNjtToken();
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;

    if (!token || !username || !password) {
        console.warn(`[NJT] API unavailable for ${stationCode} (Token: ${!!token}). Using static fallback.`);
        return getStaticFallback(stationCode, destStopId);
    }

    try {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        params.append('token', token);
        params.append('station', stationCode);

        // Using getScheduleWithStops for richer data and higher quota
        const res = await axios.post(`${NJT_BASE_URL}/getScheduleWithStops`, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (res.data && res.data.ITEMS) {
            return res.data.ITEMS.map((item: any) => ({
                train_id: item.TRAIN_ID,
                line: item.LINE,
                destination: item.DESTINATION,
                track: item.TRACK || '-', // Preserve Track Info
                time: parseNjtDate(item.SCHED_DEP_DATE).toISOString(),
                status: item.STATUS || 'ON TIME',
                stops: item.STOPS
            }));
        } else {
            console.warn(`[NJT] Empty response or error from API for ${stationCode}. Using static fallback.`);
            return getStaticFallback(stationCode, destStopId);
        }
    } catch (error: any) {
        console.error(`NJT Fetch Error (${stationCode}):`, error.message);
        return getStaticFallback(stationCode, destStopId);
    }
}

function getStaticFallback(stationCode: string, destStopId?: string | null): NjtDeparture[] {
    const match = njtFallback.find(f => f.originId === stationCode && f.destId === destStopId);

    const now = new Date();
    const nowNYC = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

    if (match) {
        return match.departures.map((timeStr, idx) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const depDate = new Date(nowNYC);
            depDate.setHours(hours, minutes, 0, 0);

            // If the time has already passed, it might be for tomorrow if we're near midnight, 
            // but usually we just want the next upcoming ones.
            // If depDate < nowNYC - 30 mins, assume it's tomorrow (simplified)
            if (depDate.getTime() < nowNYC.getTime() - 30 * 60000) {
                depDate.setDate(depDate.getDate() + 1);
            }

            return {
                train_id: `STATIC-${idx}`,
                line: match.route,
                destination: (njtStations as any[]).find(s => s.id === destStopId)?.name || 'Unknown',
                track: '-',
                time: depDate.toISOString(),
                status: 'SCHEDULED (Static)'
            };
        });
    }

    // Ultimate fallback if no specific route match found
    return [
        {
            train_id: 'STATIC-1',
            line: 'Transit Pulse Fallback',
            destination: 'Check NJT Schedule',
            track: '-',
            time: new Date(now.getTime() + 15 * 60000).toISOString(),
            status: 'SCHEDULED'
        }
    ];
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
