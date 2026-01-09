
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parse/sync';
const GTFS_DIR = path.join(__dirname, '../gtfs_data');
const OUT_FILE = path.join(__dirname, '../src/lib/mta_bus_stops.json');

// Interface for Stop
interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    direction?: string; // Captures trip_headsign (Destination)
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

    // 2. Load Trips (to map Route -> Trip -> Stop (+ Headsign))
    const tripsPath = path.join(feedDir, 'trips.txt');
    const tripsData = fs.readFileSync(tripsPath, 'utf8');
    const trips = csv.parse(tripsData, { columns: true, skip_empty_lines: true });

    // TripID -> { RouteID, Headsign, DirectionID }
    const tripMeta = new Map<string, { routeId: string, headsign: string, dir: string }>();

    trips.forEach((t: any) => {
        tripMeta.set(t.trip_id, {
            routeId: t.route_id,
            headsign: t.trip_headsign || 'Unknown',
            dir: t.direction_id
        });
    });

    // 3. Load Stop Times
    console.log(`  Reading stop_times.txt...`);
    const stopTimesPath = path.join(feedDir, 'stop_times.txt');
    const stopTimesData = fs.readFileSync(stopTimesPath, 'utf8');
    const stopTimes = csv.parse(stopTimesData, { columns: true, skip_empty_lines: true });

    // Build Route -> StopID -> { Set<Headsigns> }
    // We want to associate a stop on a route with its destination(s).
    const routeStopDestinations = new Map<string, Map<string, Set<string>>>();

    stopTimes.forEach((st: any) => {
        const tripId = st.trip_id;
        const stopId = st.stop_id;
        const meta = tripMeta.get(tripId);

        if (meta) {
            const routeId = meta.routeId;
            if (!routeStopDestinations.has(routeId)) {
                routeStopDestinations.set(routeId, new Map());
            }
            const stopsForRoute = routeStopDestinations.get(routeId)!;
            if (!stopsForRoute.has(stopId)) {
                stopsForRoute.set(stopId, new Set());
            }
            // Add the headsign
            if (meta.headsign) {
                stopsForRoute.get(stopId)!.add(meta.headsign);
            }
        }
    });

    // 4. Construct Final Map
    for (const [routeId, stopDestMap] of routeStopDestinations.entries()) {
        const fullStops: Stop[] = [];

        for (const [stopId, headsigns] of stopDestMap.entries()) {
            const s = stopMap.get(stopId);
            if (!s) continue;

            // Format direction: "To Chelsea Piers" or just "Chelsea Piers"
            // If multiple headsigns, join them?
            const distinctHeadsigns = Array.from(headsigns);
            const directionStr = distinctHeadsigns.slice(0, 2).join(' / '); // Limit to 2

            fullStops.push({
                id: s.stop_id,
                name: s.stop_name || s.stop_desc,
                lat: parseFloat(s.stop_lat),
                lon: parseFloat(s.stop_lon),
                direction: directionStr
            });
        }

        if (!routeStops[routeId]) {
            routeStops[routeId] = [];
        }

        // Merge with existing stops from other feeds (unlikely for same route, but possible)
        const existingids = new Set(routeStops[routeId].map(s => s.id));
        fullStops.forEach(s => {
            if (!existingids.has(s.id)) {
                routeStops[routeId].push(s);
            }
        });
    }
    console.log(`  Processed ${routeStopDestinations.size} routes.`);
}

const feeds = ['manhattan', 'queens', 'brooklyn', 'bronx', 'staten_island', 'mtabc'];
feeds.forEach(processFeed);

fs.writeFileSync(OUT_FILE, JSON.stringify(routeStops, null, 2));
console.log(`\n✅ Index built at ${OUT_FILE}`);
console.log(`Total Routes: ${Object.keys(routeStops).length}`);
