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

import njtGtfsMapping from './njt_gtfs_mapping.json';
import { getNextTrainsById, NjtSqlTrip } from './njt_sql';

// Helper to convert SQL Trip to App Trip
function sqlTripToDeparture(trip: NjtSqlTrip, stopId: string): NjtDeparture {
    const now = new Date();
    // Create Date from minutes-from-midnight
    // Robust Eastern Time Midnight Calculation
    const nycFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = nycFormatter.formatToParts(now);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

    // Construct simplified IOS string YYYY-MM-DD
    const yyyy = getPart('year');
    const mm = String(getPart('month')).padStart(2, '0');
    const dd = String(getPart('day')).padStart(2, '0');

    // Create base date string for America/New_York
    // We can't easily construct a Date object set to EST midnight using native Date without shifts.
    // Instead: Calculate timestamp of 00:00 EST today.

    // Easier approach: Use the string constructor with offset
    // EST is -5, EDT is -4. 
    // Optimization: Just assume we are in the same day as 'now' and use setHours IF we can force TZ.
    // Actually, simply constructing the UTC string for the correct time might be safer.

    // Let's rely on the fact we have the date parts:
    // Trip Time: HH:MM
    const hours = Math.floor(trip.origin_time / 60);
    const minutes = trip.origin_time % 60;

    const hh = String(hours).padStart(2, '0');
    const min = String(minutes).padStart(2, '0');

    // HARDCODED OFFSET for now (Winter/Jan = -05:00)
    // To do this properly requires a library, but -05:00 is safe for Jan.
    const isoString = `${yyyy}-${mm}-${dd}T${hh}:${min}:00-05:00`;

    // Verify validity
    const depTime = new Date(isoString);

    return {
        train_id: `SQL-${trip.trip_id}`, // Prefix to distinguish
        line: `Line ${trip.route_id}`, // OR map route_id to name if needed
        destination: trip.headsign, // SQL DB has headsign!
        track: '-',
        time: depTime.toISOString(),
        status: 'SCHEDULED'
    };
}

function getStaticFallback(stationCode: string, destStopId?: string | null): NjtDeparture[] {
    // 1. Try SQL Database first
    if (destStopId) {
        const originGtfsId = (njtGtfsMapping as any)[stationCode];
        const destGtfsId = (njtGtfsMapping as any)[destStopId];

        if (originGtfsId && destGtfsId) {
            try {
                // limit 10 to ensure we have enough to show after real-time merge
                const sqlTrips = getNextTrainsById(parseInt(originGtfsId), parseInt(destGtfsId), 10);
                if (sqlTrips.length > 0) {
                    return sqlTrips.map(t => sqlTripToDeparture(t, stationCode));
                }
            } catch (e) {
                console.warn("[NJT] SQL Lookup failed, falling back to JSON:", e);
            }
        }
    }

    // 2. Original JSON Fallback (Legacy)
    const match = njtFallback.find(f => f.originId === stationCode && f.destId === destStopId);

    const now = new Date();
    // Get YYYY-MM-DD in NYC 
    const nycFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [{ value: month }, , { value: day }, , { value: year }] = nycFormatter.formatToParts(now);

    // Simple DST Check (March-Nov approximation or fixed for now)
    // Jan is Standard (-05:00).
    const isDst = false;
    const offset = isDst ? "-04:00" : "-05:00";

    if (match) {
        return match.departures.map((timeStr, idx) => {
            let [hours, minutes] = timeStr.split(':').map(Number);
            let depIso = `${year}-${month}-${day}T${timeStr}:00${offset}`;
            let depDate = new Date(depIso);

            if (depDate.getTime() < now.getTime() - 30 * 60000) {
                // Try tomorrow
                const tomorrow = new Date(depDate);
                tomorrow.setDate(tomorrow.getDate() + 1);
                depDate = tomorrow;
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
            line: 'NJT Scheduler',
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
