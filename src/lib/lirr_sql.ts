
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Vercel Serverless environment handling
const DB_FILENAME = 'lirr_schedule.db';
let db: any;

function getDb() {
    if (!db) {
        try {
            // Attempt 1: Strict path (traced)
            let dbPath = path.join(process.cwd(), 'src/lib', DB_FILENAME);

            // Attempt 2: Same directory (bundled)
            if (!fs.existsSync(dbPath)) {
                // console.warn(`[LIRR-SQL] DB not found at ${dbPath}. Checking other locations...`);
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
                console.error(`[LIRR-SQL] CRITICAL: DB file not found! CWD: ${process.cwd()}`);
                return null;
            }

            // WORKAROUND: Copy to /tmp to avoid SQLITE_CANTOPEN (Read-only FS issues with WAL/locking)
            const tmpDbPath = path.join('/tmp', DB_FILENAME);
            try {
                if (dbPath !== tmpDbPath) {
                    if (!fs.existsSync(tmpDbPath)) {
                        // console.log(`[LIRR-SQL] Copying DB from ${dbPath} to ${tmpDbPath}...`);
                        fs.copyFileSync(dbPath, tmpDbPath);
                    }
                }
                db = new Database(tmpDbPath, { readonly: true });
            } catch (copyError) {
                console.warn("[LIRR-SQL] Failed to copy to /tmp, trying direct open...", copyError);
                db = new Database(dbPath, { readonly: true });
            }
        } catch (e) {
            console.error("Failed to open LIRR DB:", e);
            return null;
        }
    }
    return db;
}

export interface LirrSqlTrip {
    trip_id: string;
    route_id: string;
    origin_time: number; // Mins from midnight
    dest_time: number; // Mins from midnight
    headsign: string;
    direction_id: number;
}

// Query by GTFS IDs directly (Preferred)
export function getNextLirrTrainsById(
    originGtfsId: string | number, // LIRR IDs are strings/numbers depending on CSV
    destGtfsId: string | number,
    limit: number = 10
): LirrSqlTrip[] {
    const database = getDb();
    if (!database) return [];

    const now = new Date();

    // Robust Eastern Time conversion using Intl
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');

    // Mins from midnight
    const currentMinutes = (hour * 60) + minute;
    const todayInt = parseInt(`${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`);

    // console.log(`[LIRR-SQL] Query: Date=${todayInt}, Time=${currentMinutes}, Ori=${originGtfsId}, Dest=${destGtfsId}`);

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
        const rows = database.prepare(query).all(todayInt, String(originGtfsId), String(destGtfsId), currentMinutes, limit);
        return rows as LirrSqlTrip[];
    } catch (e) {
        console.error("[LIRR-SQL] Query failed:", e);
        return [];
    }
}
