const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');

// Configuration
const CONFIG = {
    lirr: {
        url: 'http://web.mta.info/developers/data/lirr/google_transit.zip',
        filename: 'lirr_schedule.db'
    },
    ferry: {
        url: 'https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx',
        filename: 'ferry_schedule.db'
    }
};

const MODE = process.argv[2] === '--ferry' ? 'ferry' : 'lirr';
const TARGET = CONFIG[MODE];

console.log(`[BuildDB] Starting build for ${MODE.toUpperCase()}...`);

async function build() {
    try {
        // 1. Download
        console.log(`[BuildDB] Downloading GTFS from ${TARGET.url}...`);
        const response = await axios.get(TARGET.url, { responseType: 'arraybuffer' });
        const zip = new AdmZip(response.data);

        const tmpDir = path.join(process.cwd(), 'tmp_gtfs');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        console.log(`[BuildDB] Extracting to ${tmpDir}...`);
        zip.extractAllTo(tmpDir, true);

        // 2. Init DB
        const dbPath = path.join(process.cwd(), 'src/lib', TARGET.filename);
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

        console.log(`[BuildDB] Creating Database at ${dbPath}...`);
        const db = new Database(dbPath);

        // Schema
        db.exec(`
            CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE trips (trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT, headsign TEXT, direction_id INTEGER);
            CREATE TABLE stop_times (trip_id TEXT, stop_id TEXT, arrival_time INTEGER, departure_time INTEGER, stop_sequence INTEGER);
            CREATE TABLE services (service_id TEXT, date INTEGER);
            
            CREATE INDEX idx_stop_times_trip ON stop_times(trip_id);
            CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);
            CREATE INDEX idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence);
            CREATE INDEX idx_trips_service ON trips(service_id);
            CREATE INDEX idx_services_date ON services(date);
        `);

        // 3. Process Stops
        console.log('[BuildDB] Processing Stops...');
        const stopsData = parse(fs.readFileSync(path.join(tmpDir, 'stops.txt')), { columns: true, skip_empty_lines: true });
        const insertStop = db.prepare('INSERT OR IGNORE INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, ?, ?)');
        const insertStopMany = db.transaction((stops) => {
            for (const s of stops) insertStop.run(s.stop_id, s.stop_name || s.stop_desc, s.stop_lat, s.stop_lon);
        });
        insertStopMany(stopsData);

        // 4. Process Trips
        console.log('[BuildDB] Processing Trips...');
        const tripsData = parse(fs.readFileSync(path.join(tmpDir, 'trips.txt')), { columns: true, skip_empty_lines: true });
        const insertTrip = db.prepare('INSERT INTO trips (trip_id, route_id, service_id, headsign, direction_id) VALUES (?, ?, ?, ?, ?)');
        const insertTripMany = db.transaction((trips) => {
            for (const t of trips) insertTrip.run(t.trip_id, t.route_id, t.service_id, t.trip_headsign, t.direction_id);
        });
        insertTripMany(tripsData);

        // 5. Process Stop Times
        console.log('[BuildDB] Processing Stop Times (this may take a moment)...');
        // Stop Times is huge, assume it fits in memory? LIRR ~1M lines?
        // Streaming is better, but csv-parse/sync loads all.
        // For LIRR, it might be large. If Node crashes, switch to stream.
        // Try reading file line by line?
        // We'll trust memory for now (Agent machine usually has RAM).
        const stopTimesData = parse(fs.readFileSync(path.join(tmpDir, 'stop_times.txt')), { columns: true, skip_empty_lines: true });

        // Helper: Convert HH:MM:SS to minutes
        const timeToMins = (str) => {
            if (!str) return null;
            const parts = str.split(':').map(Number);
            return (parts[0] * 60) + parts[1]; // Ignore seconds for schedule matching
        };

        const insertStopTime = db.prepare('INSERT INTO stop_times (trip_id, stop_id, arrival_time, departure_time, stop_sequence) VALUES (?, ?, ?, ?, ?)');
        const insertStopTimeMany = db.transaction((st) => {
            for (const s of st) {
                const arr = timeToMins(s.arrival_time);
                const dep = timeToMins(s.departure_time);
                insertStopTime.run(s.trip_id, s.stop_id, arr, dep, s.stop_sequence);
            }
        });
        insertStopTimeMany(stopTimesData);

        // 6. Process Services (Calendar Flattening)
        console.log('[BuildDB] Processing Services (Calendar Flattening)...');

        // Read calendar.txt (Rules)
        let calendar = [];
        if (fs.existsSync(path.join(tmpDir, 'calendar.txt'))) {
            calendar = parse(fs.readFileSync(path.join(tmpDir, 'calendar.txt')), { columns: true });
        }

        // Read calendar_dates.txt (Exceptions)
        let calendarDates = [];
        if (fs.existsSync(path.join(tmpDir, 'calendar_dates.txt'))) {
            calendarDates = parse(fs.readFileSync(path.join(tmpDir, 'calendar_dates.txt')), { columns: true });
        }

        // Determine Date Range (Today -> +6 Months)
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 6);

        // Generate valid dates for each service
        const serviceMap = new Map(); // service_id -> Set<YYYYMMDD>

        // A. Handle Calendar Rules
        for (const rule of calendar) {
            const startStr = rule.start_date;
            const endStr = rule.end_date;
            // Parse YYYYMMDD
            const ruleStart = new Date(startStr.slice(0, 4), startStr.slice(4, 6) - 1, startStr.slice(6, 8));
            const ruleEnd = new Date(endStr.slice(0, 4), endStr.slice(4, 6) - 1, endStr.slice(6, 8));

            // Intersection with our window
            const rangeStart = ruleStart > startDate ? ruleStart : startDate;
            const rangeEnd = ruleEnd < endDate ? ruleEnd : endDate;

            if (rangeStart > rangeEnd) continue;

            let current = new Date(rangeStart);
            while (current <= rangeEnd) {
                const day = current.getDay(); // 0=Sun, 1=Mon...
                // Check if day is enabled
                // calendar.txt has monday, tuesday... enums (1 or 0)
                const dayMap = [rule.sunday, rule.monday, rule.tuesday, rule.wednesday, rule.thursday, rule.friday, rule.saturday];
                if (dayMap[day] === '1') {
                    const dateInt = parseInt(current.toISOString().slice(0, 10).replace(/-/g, ''));
                    if (!serviceMap.has(rule.service_id)) serviceMap.set(rule.service_id, new Set());
                    serviceMap.get(rule.service_id).add(dateInt);
                }
                current.setDate(current.getDate() + 1);
            }
        }

        // B. Handle Exceptions (calendar_dates)
        for (const ex of calendarDates) {
            const dateInt = parseInt(ex.date);
            // exception_type: 1 = Add, 2 = Remove
            if (!serviceMap.has(ex.service_id)) serviceMap.set(ex.service_id, new Set());

            if (ex.exception_type === '1') {
                // Add (even if not in calendar.txt range, strictly speaking. But let's assume valid future only?)
                // Just add it.
                if (dateInt >= parseInt(startDate.toISOString().slice(0, 10).replace(/-/g, ''))) {
                    serviceMap.get(ex.service_id).add(dateInt);
                }
            } else if (ex.exception_type === '2') {
                // Remove
                serviceMap.get(ex.service_id).delete(dateInt);
            }
        }

        // Insert into DB
        const insertService = db.prepare('INSERT INTO services (service_id, date) VALUES (?, ?)');
        const insertServiceMany = db.transaction(() => {
            for (const [svcId, dates] of serviceMap.entries()) {
                for (const date of dates) {
                    insertService.run(svcId, date);
                }
            }
        });
        insertServiceMany();

        console.log('[BuildDB] Vacuuming...');
        db.exec('VACUUM');

        console.log(`[BuildDB] Done! Saved to ${dbPath}`);

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });

    } catch (e) {
        console.error('[BuildDB] Error:', e);
        process.exit(1);
    }
}

build();
