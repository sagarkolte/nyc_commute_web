
import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import * as fs from 'fs';
import * as path from 'path';
import stationMapping from './njt_gtfs_mapping.json';

const NJT_TEST_BASE = 'https://testraildata.njtransit.com/api/GTFSRT';
const TOKEN_CACHE_FILE = '/tmp/njt_gtfs_token.json';

// Reuse the token caching logic from njt.ts but for GTFS
async function getGtfsToken(): Promise<string | null> {
    // 1. Check Cache
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
            const age = (Date.now() - cached.timestamp) / 1000;
            if (age < 3600) {
                return cached.token;
            }
        } catch (e) {
            // ignore
        }
    }

    // 2. Fetch New
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    if (!username || !password) return null;

    try {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        const res = await axios.post(`${NJT_TEST_BASE}/getToken`, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const token = res.data.UserToken;
        if (token) {
            fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
                token,
                timestamp: Date.now()
            }));
            return token;
        }
    } catch (e) {
        console.error("[NJT-GTFS] Token fetch failed:", (e as Error).message);
    }
    return null;
}

export interface GTFSDeparture {
    trip_id: string;
    route_id: string;
    stop_id: string;
    time: number; // Unix TS
    delay: number; // Seconds
    status?: string;
}

export async function fetchGtfsDepartures(stationCode: string): Promise<GTFSDeparture[]> {
    const numericId = (stationMapping as any)[stationCode];
    if (!numericId) {
        console.warn(`[NJT-GTFS] No mapping for station ${stationCode}`);
        return [];
    }

    const token = await getGtfsToken();
    if (!token) return [];

    try {
        const params = new URLSearchParams();
        params.append('token', token);

        const res = await axios.post(`${NJT_TEST_BASE}/getTripUpdates`, params.toString(), {
            responseType: 'arraybuffer',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(res.data));
        const departures: GTFSDeparture[] = [];

        feed.entity.forEach(entity => {
            if (entity.tripUpdate) {
                const tu = entity.tripUpdate;
                // Find update for OUR station
                const stopUpdate = tu.stopTimeUpdate?.find((s: any) => s.stopId === numericId);

                if (stopUpdate) {
                    // Use Departure time if avail, else Arrival
                    const event = stopUpdate.departure || stopUpdate.arrival;
                    if (event && event.time) {
                        departures.push({
                            trip_id: tu.trip.tripId as string,
                            route_id: tu.trip.routeId as string, // Numeric ID
                            stop_id: numericId,
                            time: Number(event.time) * 1000, // Convert to ms for JS Date
                            delay: event.delay || 0,
                            status: (event.delay && event.delay > 300) ? 'DELAYED' : 'ON TIME'
                        });
                    }
                }
            }
        });

        return departures;

    } catch (e) {
        console.error(`[NJT-GTFS] Feed fetch failed:`, (e as Error).message);
        return [];
    }
}
