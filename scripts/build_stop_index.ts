
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GTFS_DIR = path.join(__dirname, '../gtfs_data');
const OUT_FILE = path.join(__dirname, '../src/lib/mta_bus_stops.json');

// Interface for Stop
interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    direction?: string; // e.g. "0" or "1" (GTFS)
}

// Map: RouteID -> Stop[]
const routeStops: Record<string, Stop[]> = {};

function processFeed(feedName: string) {
    const feedDir = path.join(GTFS_DIR, feedName);
    if (!fs.existsSync(feedDir)) {
        console.warn(`Feed not found: ${feedName}`);
        return;
    }
    console.log(`Processing ${feedName}...`);

    // 1. Load Stops
    const stopsPath = path.join(feedDir, 'stops.txt');
    const stopsData = fs.readFileSync(stopsPath, 'utf8');
    const stops = csv.parse(stopsData, { columns: true, skip_empty_lines: true });

    const stopMap = new Map<string, any>();
    stops.forEach((s: any) => stopMap.set(s.stop_id, s));

    // 2. Load Trips (to map Route -> Trip -> Stop)
    const tripsPath = path.join(feedDir, 'trips.txt');
    const tripsData = fs.readFileSync(tripsPath, 'utf8');
    const trips = csv.parse(tripsData, { columns: true, skip_empty_lines: true });

    // Group Trips by Route
    // We only need ONE trip per Shape/Direction ideally to get the stops.
    // Or we scan all trips to find unique stops?
    // GTFS for buses: Routes often have variations.
    // Strategy: Collect ALL stops for a route, then unique them?
    // Or categorize by Direction ID (0/1)?

    // Let's create a Set of StopIDs per Route
    const routeStopIds = new Map<string, Set<string>>();

    trips.forEach((t: any) => {
        const routeId = t.route_id;
        if (!routeStopIds.has(routeId)) {
            routeStopIds.set(routeId, new Set());
        }
        // We defer stop times loading to huge file.
    });

    // 3. Load Stop Times (Huge file!)
    // If we iterate stop_times, we can see which trip uses which stop.
    // This file can be 100MB+.
    const stopTimesPath = path.join(feedDir, 'stop_times.txt');
    console.log(`  Reading stop_times.txt (this may take a moment)...`);

    // Streaming might be better but let's try Sync for simplicity first (server has RAM).
    // Actually, reading 100MB into memory is risky if 6 feeds run sequentially.
    // But we process one feed at a time.
    const stopTimesData = fs.readFileSync(stopTimesPath, 'utf8');
    const stopTimes = csv.parse(stopTimesData, { columns: true, skip_empty_lines: true });

    // Build Lookups
    // TripID -> RouteID (from trips)
    const tripToRoute = new Map<string, string>();
    trips.forEach((t: any) => tripToRoute.set(t.trip_id, t.route_id));

    stopTimes.forEach((st: any) => {
        const tripId = st.trip_id;
        const stopId = st.stop_id;
        const routeId = tripToRoute.get(tripId);

        if (routeId) {
            routeStopIds.get(routeId)?.add(stopId);
        }
    });

    // 4. Construct Final Map
    for (const [routeId, stopIdSet] of routeStopIds.entries()) {
        const fullStops = Array.from(stopIdSet).map(sid => {
            const s = stopMap.get(sid);
            if (!s) return null;
            return {
                id: s.stop_id,
                name: s.stop_name,
                lat: parseFloat(s.stop_lat),
                lon: parseFloat(s.stop_lon),
                direction: 'N/A' // Hard to deduce without Trip details
            };
        }).filter(s => s !== null) as Stop[];

        if (!routeStops[routeId]) {
            routeStops[routeId] = [];
        }
        // Merge
        const existingids = new Set(routeStops[routeId].map(s => s.id));
        fullStops.forEach(s => {
            if (!existingids.has(s.id)) {
                routeStops[routeId].push(s);
            }
        });
    }
    console.log(`  Processed ${routeStopIds.size} routes.`);
}

const feeds = ['manhattan', 'queens', 'brooklyn', 'bronx', 'staten_island', 'mtabc'];
feeds.forEach(processFeed);

// Write Output
fs.writeFileSync(OUT_FILE, JSON.stringify(routeStops, null, 2));
console.log(`\n✅ Index built at ${OUT_FILE}`);
console.log(`Total Routes: ${Object.keys(routeStops).length}`);

