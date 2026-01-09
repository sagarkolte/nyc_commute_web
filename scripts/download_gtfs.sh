#!/bin/bash
# Download MTA Bus GTFS Data (All Boroughs + MTA Bus Co)
# Uses -L to follow redirects (Critical!).

mkdir -p gtfs_data

echo "Downloading GTFS Data (Full Set)..."

download_feed() {
    name=$1
    url=$2
    echo "Fetching $name..."
    # -s: Silent, -L: Follow Redirects, -o: Output file
    curl -s -L -o gtfs_data/$name.zip "$url"
    
    # Check if zip is valid
    if unzip -tq gtfs_data/$name.zip > /dev/null; then
        echo "✅ $name downloaded and valid."
        mkdir -p gtfs_data/$name
        unzip -o -q gtfs_data/$name.zip -d gtfs_data/$name
    else
        echo "❌ $name download failed or invalid zip."
        rm gtfs_data/$name.zip
    fi
}

# 1. Manhattan
download_feed "manhattan" "http://web.mta.info/developers/data/nyct/bus/google_transit_manhattan.zip"

# 2. Queens
download_feed "queens" "http://web.mta.info/developers/data/nyct/bus/google_transit_queens.zip"

# 3. Brooklyn
download_feed "brooklyn" "http://web.mta.info/developers/data/nyct/bus/google_transit_brooklyn.zip"

# 4. Bronx
download_feed "bronx" "http://web.mta.info/developers/data/nyct/bus/google_transit_bronx.zip"

# 5. Staten Island
download_feed "staten_island" "http://web.mta.info/developers/data/nyct/bus/google_transit_staten_island.zip"

# 6. MTA Bus Company (Regional/Express)
download_feed "mtabc" "http://web.mta.info/developers/data/bus/google_transit_bus_company.zip"

echo "All downloads processed."
