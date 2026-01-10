
import Database from 'better-sqlite3';
import path from 'path';

// Load DB
import fs from 'fs';

// Load DB
// Vercel Serverless environment handling
const DB_FILENAME = 'njt_schedule.db';
let db: any;

function getDb() {
    if (!db) {
        try {
            // Attempt 1: Strict path (traced)
            let dbPath = path.join(process.cwd(), 'src/lib', DB_FILENAME);

            // Attempt 2: Same directory (bundled)
            if (!fs.existsSync(dbPath)) {
                console.warn(`[NJT-SQL] DB not found at ${dbPath}. Checking other locations...`);
                const altPath = path.join(__dirname, DB_FILENAME);
                if (fs.existsSync(altPath)) {
                    dbPath = altPath;
                } else {
                    // Attempt 3: Root (flat bundle)
                    const rootPath = path.join(process.cwd(), DB_FILENAME);
                    if (fs.existsSync(rootPath)) {
                        dbPath = rootPath;
                    }
                }
            }

            if (!fs.existsSync(dbPath)) {
                console.error(`[NJT-SQL] CRITICAL: DB file not found! CWD: ${process.cwd()}`);
                // List files to help debug
                try {
                    console.log("CWD Listing:", fs.readdirSync(process.cwd()));
                    console.log("Lib Listing:", fs.readdirSync(path.join(process.cwd(), 'src/lib')));
                } catch (e) { }
                return null;
            }

            console.log("[NJT-SQL] Opening DB at:", dbPath);
            db = new Database(dbPath, { readonly: true });
        } catch (e) {
            console.error("Failed to open NJT DB:", e);
            return null;
        }
    }
    return db;
}

export interface NjtSqlTrip {
    trip_id: string; // "123"
    route_id: string; // "9" (Line ID)
    origin_time: number; // Mins from midnight
    dest_time: number; // Mins from midnight
    headsign: string;
    direction_id: number;
    block_id?: string; // Not in schema, ignore
}

// Convert "YYYYMMDD" (Integer) to Date object
function parseDateInt(d: number): Date {
    const s = d.toString();
    const year = parseInt(s.substring(0, 4));
    const month = parseInt(s.substring(4, 6)) - 1;
    const day = parseInt(s.substring(6, 8));
    return new Date(year, month, day);
}

// Convert Date to "YYYYMMDD" Integer
function toDateInt(d: Date): number {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return parseInt(`${yyyy}${mm}${dd}`);
}

// Query by GTFS IDs directly (Preferred)
export function getNextTrainsById(
    originGtfsId: number,
    destGtfsId: number,
    limit: number = 3
): NjtSqlTrip[] {
    const database = getDb();
    if (!database) return [];

    const now = new Date();
    // NJT Timezone handling needed? 
    // Assuming server time or local time. For safety, let's use Eastern Time.
    const nycTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const currentMinutes = (nycTime.getHours() * 60) + nycTime.getMinutes();
    const todayInt = toDateInt(nycTime);

    // 2. Query Schedule
    const query = `
        SELECT 
            t.trip_id, 
            t.route_id, 
            t.headsign, 
            t.direction_id,
            st1.departure_time as origin_time,
            st2.arrival_time as dest_time
        FROM trips t
        JOIN services s ON t.service_id = s.service_id
        JOIN stop_times st1 ON t.trip_id = st1.trip_id
        JOIN stop_times st2 ON t.trip_id = st2.trip_id
        WHERE s.date = ?
        AND st1.stop_id = ?
        AND st2.stop_id = ?
        AND st1.departure_time >= ?
        AND st1.stop_sequence < st2.stop_sequence
        ORDER BY st1.departure_time ASC
        LIMIT ?
    `;

    try {
        const rows = database.prepare(query).all(todayInt, originGtfsId, destGtfsId, currentMinutes, limit);
        return rows as NjtSqlTrip[];
    } catch (e) {
        console.error("Query failed:", e);
        return [];
    }
}

export function getNextTrains(
    originStopName: string,
    destStopName: string,
    limit: number = 3
): NjtSqlTrip[] {
    const database = getDb();
    if (!database) return [];

    // Helper to find ID
    const findId = (name: string) => {
        // Try exact
        const exact = database.prepare('SELECT stop_id FROM stops WHERE stop_name = ?').get(name);
        if (exact) return exact.stop_id;
        // Try LIKE
        const like = database.prepare('SELECT stop_id FROM stops WHERE stop_name LIKE ?').get(`%${name}%`);
        if (like) return like.stop_id;
        return null;
    };

    const originId = findId(originStopName);
    const destId = findId(destStopName);

    if (!originId || !destId) {
        console.warn(`[NJT-SQL] Stops not found: ${originStopName} (${originId}) -> ${destStopName} (${destId})`);
        return [];
    }

    return getNextTrainsById(originId, destId, limit);
}
