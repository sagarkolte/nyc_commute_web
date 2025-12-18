
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

async function processStops() {
    const zipPath = path.join(process.cwd(), 'njt_bus_data.zip');
    if (!fs.existsSync(zipPath)) {
        console.error('Zip not found');
        return;
    }

    const zip = new AdmZip(zipPath);
    const stopsEntry = zip.getEntry('stops.txt');

    if (!stopsEntry) {
        console.error('stops.txt not found in zip');
        return;
    }

    const stopsCsv = stopsEntry.getData().toString('utf8');

    // Parse CSV
    // Columns usually: stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station...
    const records = parse(stopsCsv, {
        columns: true,
        skip_empty_lines: true
    });

    console.log(`Parsed ${records.length} stops.`);

    // Map to simple JSON
    const cleanStops = records.map((r: any) => ({
        id: r.stop_id,
        name: r.stop_name, // Typically "Broad St At Market St"
        lat: r.stop_lat,
        lon: r.stop_lon
    }));

    // Save
    const outPath = path.join(process.cwd(), 'src/lib/njt_bus_stations.json');
    fs.writeFileSync(outPath, JSON.stringify(cleanStops, null, 2));
    console.log(`Saved to ${outPath}`);
}

processStops();
