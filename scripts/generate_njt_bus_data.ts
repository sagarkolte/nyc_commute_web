
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const RAW_DIR = path.join(process.cwd(), 'src', 'lib');
const ROUTES_FILE = path.join(RAW_DIR, 'njt_bus_routes.txt');
const TRIPS_FILE = path.join(RAW_DIR, 'njt_bus_trips.txt');
const STOP_TIMES_FILE = path.join(RAW_DIR, 'njt_bus_stop_times.txt'); // Extracted previously
const OUTPUT_ROUTES = path.join(RAW_DIR, 'njt_bus_routes.json');
const OUTPUT_ROUTE_STOPS = path.join(RAW_DIR, 'njt_bus_route_stops.json');

async function processData() {
    console.log('Starting NJT Bus Data Generation...');

    // 0. Unzip Data if needed
    if (!fs.existsSync(STOP_TIMES_FILE)) {
        console.log('Stop times file not found. Unzipping njt_bus_data.zip...');
        const zipFile = path.join(process.cwd(), 'njt_bus_data.zip');
        if (fs.existsSync(zipFile)) {
            const { execSync } = require('child_process');
            try {
                // Determine OS to use appropriate unzip command if necessary, but 'unzip' is standard on *nix
                execSync(`unzip -o "${zipFile}" -d "${RAW_DIR}"`);
                console.log('Unzip successful.');
            } catch (e) {
                console.error('Failed to unzip data:', e);
                process.exit(1);
            }
        } else {
            console.error('CRITICAL: njt_bus_stop_times.txt missing AND njt_bus_data.zip missing.');
            process.exit(1);
        }
    }

    // 1. Parse Routes
    // route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color
    console.log('Parsing Routes...');
    const routesStream = readline.createInterface({
        input: fs.createReadStream(ROUTES_FILE),
        crlfDelay: Infinity
    });

    const routes: { id: string, shortName: string, longName: string }[] = [];
    const routeIds = new Set<string>();

    let isHeader = true;
    for await (const line of routesStream) {
        if (isHeader) { isHeader = false; continue; }
        const parts = line.split(','); // Assuming standard CSV without quoted commas for now
        // Data might have quotes, but NJT usually simple. 
        // route_id is col 0, short_name is 2, long_name is 3
        const id = parts[0];
        const shortName = parts[2]?.replace(/"/g, '');
        const longName = parts[3]?.replace(/"/g, '');

        if (id) {
            routes.push({ id, shortName, longName });
            routeIds.add(id);
        }
    }
    console.log(`Loaded ${routes.length} routes.`);


    // 2. Parse Trips (Map Trip -> Route)
    // route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id
    console.log('Parsing Trips...');
    const tripsStream = readline.createInterface({
        input: fs.createReadStream(TRIPS_FILE),
        crlfDelay: Infinity
    });

    const tripToRoute = new Map<string, string>();
    isHeader = true;
    for await (const line of tripsStream) {
        if (isHeader) { isHeader = false; continue; }
        const parts = line.split(',');
        // trip_id,route_id,service_id,trip_headsign,...
        const tripId = parts[0];
        const routeId = parts[1];

        if (tripId && routeId && routeIds.has(routeId)) {
            tripToRoute.set(tripId, routeId);
        }
    }
    console.log(`Loaded ${tripToRoute.size} trips.`);

    // 3. Parse Stop Times (Map Route -> Stops)
    // trip_id,arrival_time,departure_time,stop_id,stop_sequence,...
    console.log('Processing Stop Times (this may take a moment)...');
    const stopTimesStream = readline.createInterface({
        input: fs.createReadStream(STOP_TIMES_FILE),
        crlfDelay: Infinity
    });

    const routeStops = new Map<string, Set<string>>();

    isHeader = true;
    let count = 0;
    for await (const line of stopTimesStream) {
        if (isHeader) { isHeader = false; continue; }
        const parts = line.split(',');
        const tripId = parts[0];
        const stopId = parts[3];

        if (tripId && stopId) {
            const routeId = tripToRoute.get(tripId);
            if (routeId) {
                if (!routeStops.has(routeId)) {
                    routeStops.set(routeId, new Set());
                }
                routeStops.get(routeId)?.add(stopId);
            }
        }

        count++;
        if (count % 500000 === 0) process.stdout.write(`Processed ${count} stop_times...\r`);
    }
    console.log(`\nProcessed ${count} stop_times.`);

    // 4. Write Output
    console.log('Writing output files...');

    // Convert Map<string, Set<string>> to Record<string, string[]>
    const routeStopsObj: Record<string, string[]> = {};
    for (const [routeId, stops] of routeStops) {
        routeStopsObj[routeId] = Array.from(stops);
    }

    fs.writeFileSync(OUTPUT_ROUTES, JSON.stringify(routes, null, 2));
    fs.writeFileSync(OUTPUT_ROUTE_STOPS, JSON.stringify(routeStopsObj));

    console.log(`Done! Routes: ${OUTPUT_ROUTES}, Map: ${OUTPUT_ROUTE_STOPS}`);
}

processData().catch(console.error);
