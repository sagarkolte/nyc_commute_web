
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../src/lib/njt_schedule.db');
const db = new Database(DB_PATH, { readonly: true });

function run() {
    console.log("--- Debugging Missing Routes ---");

    // IDs from mapping
    const NY = 105;
    const TR = 148; // Trenton
    const DO = 35;  // Dover
    const LB = 74;  // Long Branch

    const pairs = [
        { name: 'Trenton -> NY', origin: TR, dest: NY },
        { name: 'Dover -> NY', origin: DO, dest: NY },
        { name: 'Long Branch -> NY', origin: LB, dest: NY }
    ];

    const now = new Date();
    const nycTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const yyyy = nycTime.getFullYear();
    const mm = String(nycTime.getMonth() + 1).padStart(2, '0');
    const dd = String(nycTime.getDate()).padStart(2, '0');
    const todayInt = parseInt(`${yyyy}${mm}${dd}`);

    console.log(`Date: ${todayInt}`);

    pairs.forEach(p => {
        console.log(`\nChecking ${p.name} (${p.origin} -> ${p.dest})...`);

        // 1. Check if stops exist in DB
        const oStop = db.prepare('SELECT * FROM stops WHERE stop_id = ?').get(p.origin) as any;
        const dStop = db.prepare('SELECT * FROM stops WHERE stop_id = ?').get(p.dest) as any;

        if (!oStop) console.error(`❌ Origin Stop ${p.origin} NOT FOUND in DB!`);
        else console.log(`Origin: ${oStop.stop_name}`);

        if (!dStop) console.error(`❌ Dest Stop ${p.dest} NOT FOUND in DB!`);
        else console.log(`Dest: ${dStop.stop_name}`);

        if (!oStop || !dStop) return;

        // 2. Check Trips via SQL
        const query = `
            SELECT count(*) as c
            FROM trips t
            JOIN services s ON t.service_id = s.service_id
            JOIN stop_times st1 ON t.trip_id = st1.trip_id
            JOIN stop_times st2 ON t.trip_id = st2.trip_id
            WHERE s.date = ?
            AND st1.stop_id = ?
            AND st2.stop_id = ?
            AND st1.stop_sequence < st2.stop_sequence
        `;

        const count = (db.prepare(query).get(todayInt, p.origin, p.dest) as any).c;
        console.log(`Found ${count} trips for today.`);

        if (count > 0) {
            const serviceQuery = `
                SELECT DISTINCT t.headsign
                FROM trips t
                JOIN services s ON t.service_id = s.service_id
                JOIN stop_times st1 ON t.trip_id = st1.trip_id
                JOIN stop_times st2 ON t.trip_id = st2.trip_id
                WHERE s.date = ?
                AND st1.stop_id = ?
                AND st2.stop_id = ?
                LIMIT 5
            `;
            const headsigns = db.prepare(serviceQuery).all(todayInt, p.origin, p.dest);
            console.log("Sample Headsigns:", headsigns);
        }
    });
}

run();
