
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip'; // user might need to install adm-zip or we use child_process unzip?
// Let's use child_process unzip for simplicity to avoid huge deps if possible, 
// OR simpler: use 'adm-zip' if it's cleaner. 
// Actually, 'unzip' command is available on mac. Let's use system unzip to a temp dir.

const GTFS_ZIP = path.join(__dirname, '../njt_gtfs.zip');
const DB_PATH = path.join(__dirname, '../src/lib/njt_schedule.db');
const TEMP_DIR = path.join(__dirname, '../temp_njt_extract');

// Helper: Time HH:MM:SS -> Minutes from Midnight
function timeToMin(timeStr: string): number {
    if (!timeStr) return -1;
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h * 60) + m;
}

function cleanup() {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
}

async function build() {
    console.log("--- Building NJT Pruned SQLite DB ---");

    if (!fs.existsSync(GTFS_ZIP)) {
        console.error("❌ njt_gtfs.zip not found in root!");
        console.log("Please run scripts/download_njt_gtfs.sh for instructions.");
        process.exit(1);
    }

    // 1. Unzip
    cleanup();
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log("Unzipping GTFS...");
    const { execSync } = require('child_process');
    try {
        execSync(`unzip -q "${GTFS_ZIP}" -d "${TEMP_DIR}"`);
    } catch (e) {
        console.error("Unzip failed. Is 'unzip' installed?");
        process.exit(1);
    }

    // 2. Init DB
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    console.log("Creating Tables...");
    db.exec(`
        CREATE TABLE stops (
            stop_id INTEGER PRIMARY KEY,
            stop_name TEXT,
            stop_lat REAL,
            stop_lon REAL
        );
        CREATE TABLE services (
            service_id INTEGER,
            date INTEGER,
            PRIMARY KEY (service_id, date)
        );
        CREATE TABLE routes (
            route_id INTEGER PRIMARY KEY,
            route_short_name TEXT,
            route_long_name TEXT
        );
        CREATE TABLE trips (
            trip_id INTEGER PRIMARY KEY,
            route_id INTEGER,
            service_id INTEGER,
            headsign TEXT,
            direction_id INTEGER
        );
        CREATE TABLE stop_times (
            trip_id INTEGER,
            stop_id INTEGER,
            arrival_time INTEGER,
            departure_time INTEGER,
            stop_sequence INTEGER
        );
        CREATE INDEX idx_st_trip ON stop_times(trip_id);
        CREATE INDEX idx_st_stop_time ON stop_times(stop_id, departure_time);
        CREATE INDEX idx_trips_service ON trips(service_id);
        CREATE INDEX idx_services_date ON services(date);
    `);

    // 3. Pruning Logic: Date Range (Now -> +30 Days)
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 30);

    // YYYYMMDD as integer
    const formatDate = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return parseInt(`${yyyy}${mm}${dd}`);
    };
    const minDate = formatDate(now);
    const maxDate = formatDate(future);

    console.log(`Filtering dates: ${minDate} to ${maxDate}`);

    // 4. Process Tables
    const stmtStops = db.prepare('INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, ?, ?)');
    const stmtServices = db.prepare('INSERT INTO services (service_id, date) VALUES (?, ?)');
    const stmtRoutes = db.prepare('INSERT INTO routes (route_id, route_short_name, route_long_name) VALUES (?, ?, ?)');
    const stmtTrips = db.prepare('INSERT INTO trips (trip_id, route_id, service_id, headsign, direction_id) VALUES (?, ?, ?, ?, ?)');
    const stmtStopTimes = db.prepare('INSERT INTO stop_times (trip_id, stop_id, arrival_time, departure_time, stop_sequence) VALUES (?, ?, ?, ?, ?)');

    // -- STOPS
    console.log("Processing Stops...");
    const stops = parse(fs.readFileSync(path.join(TEMP_DIR, 'stops.txt')), { columns: true });
    db.transaction(() => {
        for (const s of (stops as any[])) {
            stmtStops.run(s.stop_id, s.stop_name, s.stop_lat, s.stop_lon);
        }
    })();

    // -- CALENDAR_DATES (Services)
    console.log("Processing Calendar Dates (Services)...");
    const validServiceIds = new Set<string>();
    // NJT usually uses calendar_dates.txt heavily. Check 'calendar.txt' too? 
    // Usually Rail is calendar_dates driven.
    let calDates: any[] = [];
    if (fs.existsSync(path.join(TEMP_DIR, 'calendar_dates.txt'))) {
        calDates = parse(fs.readFileSync(path.join(TEMP_DIR, 'calendar_dates.txt')), { columns: true });
    }

    db.transaction(() => {
        for (const cd of (calDates as any[])) {
            const dateInt = parseInt(cd.date);
            if (dateInt >= minDate && dateInt <= maxDate) {
                // NJT Exception Type 1 = Add Service.
                if (cd.exception_type === '1') {
                    stmtServices.run(cd.service_id, dateInt);
                    validServiceIds.add(cd.service_id);
                }
            }
        }
    })();
    console.log(`Found ${validServiceIds.size} active service IDs.`);

    // -- ROUTES
    console.log("Processing Routes...");
    const routes = parse(fs.readFileSync(path.join(TEMP_DIR, 'routes.txt')), { columns: true });
    db.transaction(() => {
        for (const r of (routes as any[])) {
            stmtRoutes.run(r.route_id, r.route_short_name, r.route_long_name);
        }
    })();

    // -- TRIPS (Filter by ServiceID)
    console.log("Processing Trips...");
    const trips = parse(fs.readFileSync(path.join(TEMP_DIR, 'trips.txt')), { columns: true });
    const validTripIds = new Set<string>();

    db.transaction(() => {
        for (const t of (trips as any[])) {
            if (validServiceIds.has(t.service_id)) {
                stmtTrips.run(t.trip_id, t.route_id, t.service_id, t.trip_headsign, t.direction_id);
                validTripIds.add(t.trip_id);
            }
        }
    })();
    console.log(`Kept ${validTripIds.size} trips.`);

    // -- STOP TIMES (Filter by TripID)
    console.log("Processing Stop Times (this is the big one)...");
    const stopTimes = parse(fs.readFileSync(path.join(TEMP_DIR, 'stop_times.txt')), { columns: true });

    db.transaction(() => {
        for (const st of (stopTimes as any[])) {
            if (validTripIds.has(st.trip_id)) {
                stmtStopTimes.run(
                    st.trip_id,
                    st.stop_id,
                    timeToMin(st.arrival_time),
                    timeToMin(st.departure_time),
                    st.stop_sequence
                );
            }
        }
    })();

    // Cleanup
    cleanup();
    console.log("VACUUMing DB...");
    db.exec('VACUUM');
    console.log("✅ Done.");
}

build();
