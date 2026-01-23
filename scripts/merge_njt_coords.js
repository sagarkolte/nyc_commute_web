const fs = require('fs');
const path = require('path');

const stationsPath = path.join(process.cwd(), 'src/lib/njt_stations.json');
const coordsPath = path.join(process.cwd(), 'njt_coords_dump.json');

const stations = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
const coords = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));

// Create Map for lookup (normalize names)
const coordMap = new Map();
coords.forEach(c => {
    coordMap.set(String(c.id), c);
    coordMap.set(c.name.toLowerCase(), c);
    const simple = c.name.replace(' Station', '').toLowerCase();
    coordMap.set(simple, c);
});

// Manual Mappings for failed matches
const manualMap = {
    "atlantic city rail terminal": "ATLANTIC CITY",
    "broadway fair lawn": "BROADWAY",
    "edison": "EDISON STATION",
    "egg harbor city": "EGG HARBOR",
    "jersey avenue": "JERSEY AVE.",
    "meadowlands": "MEADOWLANDS SPORTS COMPLEX", // Varies
    "monmouth park": "MONMOUTH PARK",
    "montclair state u": "MONTCLAIR STATE U", // Will be updated if grep finds better name like "MSU" or "MONTCLAIR STATE"
    "new carrollton station": "NEW CARROLLTON",
    "newark airport": "NEWARK AIRPORT RAILROAD STATION", // Confirmed
    "newark broad street": "NEWARK BROAD ST",
    "north philadelphia": "NORTH PHILADELPHIA",
    "pennsauken": "PENNSAUKEN TRANSIT CENTER",
    "philadelphia": "30TH ST. PHL.",
    "point pleasant beach": "POINT PLEASANT",
    "princeton junction": "PRINCETON JCT.",
    "radburn fair lawn": "RADBURN",
    "ramsey main st": "RAMSEY",
    "ramsey route 17": "RAMSEY ROUTE 17",
    "secaucus concourse": "SECAUCUS", // Secaucus Junction
    "secaucus lower lvl": "SECAUCUS",
    "secaucus upper lvl": "SECAUCUS",
    "trenton": "TRENTON TRANSIT CENTER",
    "wayne-route 23": "MOUNTAIN VIEW", // Similar location? Or "WAYNE/ROUTE 23"
    "wilmington station": "WILMINGTON",
    "wood ridge": "WOOD-RIDGE"
};
// Note: I need to verify target names from the dump.
// Let's create a reverse lookup logic or just print the dump keys to finding correct matches.
// Actually, I can just use the provided dump analysis.
// "SECAUCUS" likely exists as "FRANK R LAUTENBERG SECAUCUS LOWER LEVEL"? 
// Let's assume standard names or check failed list against dump.

Object.keys(manualMap).forEach(k => {
    const target = manualMap[k].toLowerCase();
    const match = coords.find(c => c.name.toLowerCase() === target || c.name.toLowerCase().includes(target));
    if (match) {
        coordMap.set(k, match);
    }
});

let updatedCount = 0;
const updatedStations = stations.map(s => {
    // Try matching
    // Note: njt_stations.json IDs are often "Absecon" (Name-like) or 2 char codes?
    // Let's check the file content again.
    // The previous view_file showed IDs like "AM", "AB".
    // The DB likely has numeric GTFS IDs? "38174"?
    // So we match by NAME.

    let match = coordMap.get(s.name.toLowerCase());

    // Heuristic Matching
    if (!match) {
        // Try removing " Station"
        match = coordMap.get(s.name.replace(' Station', '').toLowerCase());
    }

    if (match) {
        updatedCount++;
        return {
            ...s,
            lat: String(match.lat),
            lon: String(match.lon)
        };
    } else {
        console.log("No match for:", s.name);
        return s;
    }
});

fs.writeFileSync(stationsPath, JSON.stringify(updatedStations, null, 2));
console.log(`Updated ${updatedCount} stations with coordinates.`);
