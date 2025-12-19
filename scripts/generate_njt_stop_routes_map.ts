
import fs from 'fs';
import path from 'path';

const RAW_DIR = path.join(process.cwd(), 'src', 'lib');
const ROUTE_STOPS_FILE = path.join(RAW_DIR, 'njt_bus_route_stops.json');
const OUTPUT_FILE = path.join(RAW_DIR, 'njt_bus_stop_routes.json');

async function processData() {
    console.log('Generating Stop -> Routes Map...');

    if (!fs.existsSync(ROUTE_STOPS_FILE)) {
        console.error('Route stops file missing!');
        process.exit(1);
    }

    const routeStops = JSON.parse(fs.readFileSync(ROUTE_STOPS_FILE, 'utf-8'));
    const stopToRoutes: Record<string, string[]> = {};

    let stopCount = 0;
    for (const [routeId, stops] of Object.entries(routeStops)) {
        for (const stopId of (stops as string[])) {
            if (!stopToRoutes[stopId]) {
                stopToRoutes[stopId] = [];
                stopCount++;
            }
            if (!stopToRoutes[stopId].includes(routeId)) {
                stopToRoutes[stopId].push(routeId);
            }
        }
    }

    console.log(`Processed ${Object.keys(routeStops).length} routes.`);
    console.log(`Mapped ${stopCount} stops to their routes.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stopToRoutes));
    console.log(`Wrote output to ${OUTPUT_FILE}`);
}

processData().catch(console.error);
