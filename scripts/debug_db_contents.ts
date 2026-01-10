
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../src/lib/njt_schedule.db');
const db = new Database(DB_PATH, { readonly: true });

function run() {
    console.log("--- Debugging DB Contents ---");

    // 1. Check Services for TODAY
    const now = new Date();
    const nycTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const yyyy = nycTime.getFullYear();
    const mm = String(nycTime.getMonth() + 1).padStart(2, '0');
    const dd = String(nycTime.getDate()).padStart(2, '0');
    const todayInt = parseInt(`${yyyy}${mm}${dd}`);

    console.log(`Checking Services for Date: ${todayInt}`);
    const services = db.prepare('SELECT * FROM services WHERE date = ?').all(todayInt);
    console.log(`Found ${services.length} services for today.`);
    if (services.length > 0) {
        console.log("Sample Service:", services[0]);
    } else {
        console.log("No services found. Dumping top 5 services:");
        const allServices = db.prepare('SELECT * FROM services LIMIT 5').all();
        console.log(allServices);
    }

    // 2. Check Stop Times for NY (109) and NB (106)
    console.log("\nChecking Stop Names...");
    const nyStop = db.prepare('SELECT * FROM stops WHERE stop_id = 109').get();
    console.log(`Stop 109:`, nyStop);
    const nbStop = db.prepare('SELECT * FROM stops WHERE stop_id = 106').get();
    console.log(`Stop 106:`, nbStop);

    console.log("\nSearching for 'New York Penn'...");
    const pennStops = db.prepare("SELECT * FROM stops WHERE stop_name LIKE '%Penn%'").all();
    console.log("Penn Stops:", pennStops);

    console.log("\nSearching for 'New Brunswick'...");
    const nbStops = db.prepare("SELECT * FROM stops WHERE stop_name LIKE '%Brunswick%'").all();
    console.log("NB Stops:", nbStops);

    // 3. Check for Shared Trips
    console.log("\nChecking for shared trips (NY -> NB)...");
    const query = `
        SELECT count(*) as c
        FROM stop_times st1
        JOIN stop_times st2 ON st1.trip_id = st2.trip_id
        WHERE st1.stop_id = 109 AND st2.stop_id = 106
        AND st1.stop_sequence < st2.stop_sequence
    `;
    const shared = db.prepare(query).get() as any;
    console.log(`Shared Trips Count (Total): ${shared.c}`);

    // 4. Shared Trips TODAY
    const queryToday = `
        SELECT count(*) as c
        FROM trips t
        JOIN services s ON t.service_id = s.service_id
        JOIN stop_times st1 ON t.trip_id = st1.trip_id
        JOIN stop_times st2 ON t.trip_id = st2.trip_id
        WHERE s.date = ?
        AND st1.stop_id = 109 AND st2.stop_id = 106
        AND st1.stop_sequence < st2.stop_sequence
    `;
    const sharedToday = db.prepare(queryToday).get(todayInt) as any;
    console.log(`Shared Trips Count (TODAY): ${sharedToday.c}`);
}

run();
