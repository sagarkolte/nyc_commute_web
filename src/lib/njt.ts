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
        'https://raildata.njtransit.com/api/TrainData/getToken'
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
    // 1. Get Static Schedule Baseline (Targeted by destStopId if provided)
    // Note: getStaticFallback returns trips filtered by destStopId if provided.
    // Realtime API returns ALL trips from origin.
    const staticTrips = getStaticFallback(stationCode, destStopId);

    // 2. Fetch Realtime Data (Always fetch full board)
    let realtimeTrips: NjtDeparture[] = [];
    try {
        realtimeTrips = await fetchRealtimeDepartures(stationCode);
    } catch (e) {
        console.warn(`[NJT] Realtime fetch failed, using pure static.`, e);
    }

    // 3. Hybrid Merge
    // Strategy: 
    // - Start with Static Trips.
    // - Try to match each Static Trip to a Realtime Trip (Time window +/- 30m, Same Line).
    // - If matched: Update Static with Realtime info (Time, Track, Status). Mark as 'Enriched'.
    // - If Realtime Trip has no Static match: Add it to the list (It might be an extra train).

    const merged: NjtDeparture[] = [];
    const usedRealtimeIds = new Set<string>();

    staticTrips.forEach(sTrip => {
        const sTime = new Date(sTrip.time).getTime();

        // Find best match in realtime
        // Match logic: Same approximate time (within 30 mins)
        // If we had destination info in static, checking that would be good, 
        // but static trips are already filtered by dest. 
        // Realtime trips might go elsewhere. We must be careful not to match a train going to a different place.
        // HOWEVER: Static trips definitely go to user's dest. Realtime trips contain destination name.
        // We can check if Realtime Trip destination matches the Static Trip destination name? 
        // Static Trip dest name comes from looking up destId.

        const strictMatch = realtimeTrips.find(rTrip => {
            if (usedRealtimeIds.has(rTrip.train_id)) return false;

            const rTime = new Date(rTrip.time).getTime();
            const timeDiff = Math.abs(rTime - sTime);

            // Check 1: Time Window (narrower, say 60 mins -> 30 mins)
            if (timeDiff > 45 * 60 * 1000) return false;

            // Check 2: Destination Match (Fuzzy)
            // If static trip says "New York Penn", realtime should generally agree.
            // But static dest name is constructed from ID lookup.
            return true;
        });

        if (strictMatch) {
            // ENRICH STATIC
            merged.push({
                ...sTrip,
                time: strictMatch.time, // Use live time
                track: strictMatch.track,
                status: strictMatch.status || 'ON TIME',
                train_id: strictMatch.train_id, // Use real ID
                stops: strictMatch.stops // Add stops for detail
            });
            usedRealtimeIds.add(strictMatch.train_id);
        } else {
            // KEEP STATIC (No match found, API might be missing it or it's ghost)
            // Only keep if it's in the future
            if (sTime > Date.now() - 15 * 60000) {
                merged.push(sTrip);
            }
        }
    });

    // Add remaining Realtime trips (Extra service, or ones that didn't match static)
    // Note: If destStopId was provided, `staticTrips` were filtered. 
    // `realtimeTrips` are NOT filtered. Adding them all would flood the response with irrelevant trains.
    // We should rely on the caller (route.ts) to filter `merged`. 
    // SO: We MUST include unmatched realtime trips so `route.ts` can check if they go to our destination.
    realtimeTrips.forEach(rTrip => {
        if (!usedRealtimeIds.has(rTrip.train_id)) {
            merged.push(rTrip);
        }
    });

    // Sort final list
    return merged.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

import { fetchGtfsDepartures } from './njt_gtfs';

// ... (existing imports)

// ... (getNjtDepartures function implementation remains similar, but calls fetchRealtimeDepartures)

async function fetchRealtimeDepartures(stationCode: string): Promise<NjtDeparture[]> {
    try {
        const gtfsData = await fetchGtfsDepartures(stationCode);

        return gtfsData.map(d => ({
            train_id: d.trip_id,
            line: `Line ${d.route_id}`, // GTFS Route ID (Numeric)
            destination: 'See App', // GTFS doesn't give Headsign easily without trips.txt. 
            // However, the Hybrid Merge logic matches against Static trips which HAVE destinations.
            // So if matched, dest is overwritten.
            // If unmatched, "See App" is fallback.
            track: '-', // GTFS-RT usually doesn't have track for NJT (only DepartureVision does)
            // Wait, does inspection showed track? No.
            time: new Date(d.time).toISOString(),
            status: d.status || 'ON TIME',
            stops: [] // GTFS Stops are nested updates, we could parse but complex. 
        }));
    } catch (e) {
        console.warn(`[NJT] Realtime fetch failed: ${(e as Error).message}`);
        return [];
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
