
const fs = require('fs');

const njtStations = require('../src/lib/njt_stations.json');

async function buildMapping() {
    const content = fs.readFileSync('stops.txt', 'utf8');
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Find indices
    const idIdx = headers.indexOf('stop_id');
    const nameIdx = headers.indexOf('stop_name');

    // const mapping = {}; // OLD: ID -> Alpha
    const mapping = {}; // NEW: Alpha -> Numeric

    // Helper to normalize Names
    const norm = (s) => s.toLowerCase().replace(/ station$/i, '').replace(" penn station", " penn").replace(/[\s\.\-]+/g, '').trim();

    // Map existing Alpha codes to Names for lookup
    const nameToAlpha = {};
    njtStations.forEach(s => {
        nameToAlpha[norm(s.name)] = s.id;
        // Aliasing
        if (s.name.includes("Penn Station")) {
            nameToAlpha[norm(s.name.replace(" Station", ""))] = s.id;
        }
    });

    // Special override for GTFS "Penn Station New York" -> "newyorkpenn"
    nameToAlpha["pennstationnewyork"] = "NY";

    let matchedCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',');
        const stopId = cols[idIdx];
        let stopName = cols[nameIdx];
        if (stopName && stopName.startsWith('"')) {
            stopName = stopName.replace(/"/g, '');
        }

        if (!stopId || !stopName) continue;

        // Try to match NAME
        const alpha = nameToAlpha[norm(stopName)];

        if (alpha) {
            mapping[alpha] = stopId; // Alpha -> Numeric
            matchedCount++;
        }
    }

    // Manual Fixes if missing
    if (!mapping['NY']) mapping['NY'] = '109';
    if (!mapping['NP']) mapping['NP'] = '112'; // Check earlier grep

    console.log(`Matched ${matchedCount} stations.`);
    console.log("SM ->", mapping['SM']);
    console.log("NY ->", mapping['NY']);
    console.log("NP ->", mapping['NP']);

    fs.writeFileSync('src/lib/njt_gtfs_mapping.json', JSON.stringify(mapping, null, 2));
    console.log("Wrote src/lib/njt_gtfs_mapping.json (Alpha -> Numeric)");
}

buildMapping();
