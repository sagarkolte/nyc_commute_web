const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'src/lib/njt_schedule.db');
if (!fs.existsSync(dbPath)) {
    console.error("DB not found at", dbPath);
    process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

try {
    const rows = db.prepare("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops").all();
    console.log(JSON.stringify(rows.map(r => ({
        id: r.stop_id,
        name: r.stop_name,
        lat: r.stop_lat,
        lon: r.stop_lon
    })), null, 2));
} catch (e) {
    console.error("Query failed", e);
}
