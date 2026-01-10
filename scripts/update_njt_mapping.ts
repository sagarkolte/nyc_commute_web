
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const STATIONS_FILE = path.join(__dirname, '../src/lib/njt_stations.json');
const MAPPING_FILE = path.join(__dirname, '../src/lib/njt_gtfs_mapping.json');
const DB_PATH = path.join(__dirname, '../src/lib/njt_schedule.db');

const db = new Database(DB_PATH, { readonly: true });

function normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

function run() {
    console.log("--- Updating NJT GTFS Mapping ---");

    if (!fs.existsSync(STATIONS_FILE)) {
        console.error("Stations file not found!");
        process.exit(1);
    }

    const stations = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf-8'));
    const mapping: Record<string, string> = {};

    // Cache all DB stops
    const dbStops = db.prepare('SELECT stop_id, stop_name FROM stops').all() as { stop_id: number, stop_name: string }[];

    let matchedCount = 0;

    for (const st of stations) {
        const name = st.name;
        const normName = normalize(name);

        // Strategy 1: Exact Match (Case insensitive)
        let match = dbStops.find(s => s.stop_name.toLowerCase() === name.toLowerCase());

        // Strategy 2: Contains (if exact fails)
        if (!match) {
            match = dbStops.find(s => s.stop_name.toLowerCase().includes(name.toLowerCase()));
        }

        // Strategy 3: Reverse Contains (DB name inside Station name?)
        if (!match) {
            match = dbStops.find(s => name.toLowerCase().includes(s.stop_name.toLowerCase()));
        }

        // Special Overrides (Hardcoded for known issues)
        if (st.id === 'NY') { // New York Penn
            match = dbStops.find(s => s.stop_name === 'NEW YORK PENN STATION');
        }
        if (name === 'Newark Airport') {
            match = dbStops.find(s => s.stop_name.includes('NEWARK AIRPORT') || s.stop_name.includes('EWR'));
        }

        if (match) {
            mapping[st.id] = match.stop_id.toString();
            console.log(`✅ [${st.id}] ${name} -> ${match.stop_name} (${match.stop_id})`);
            matchedCount++;
        } else {
            console.warn(`❌ [${st.id}] ${name} -> NO MATCH FOUND`);
        }
    }

    console.log(`\nMatched ${matchedCount} / ${stations.length} stations.`);

    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
    console.log(`Updated ${MAPPING_FILE}`);
}

run();
