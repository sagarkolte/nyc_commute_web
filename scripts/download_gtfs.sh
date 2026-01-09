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
download_feed "manhattan" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip"

# 2. Queens
download_feed "queens" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip"

# 3. Brooklyn
download_feed "brooklyn" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip"

# 4. Bronx
download_feed "bronx" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip"

# 5. Staten Island
download_feed "staten_island" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip"

# 6. MTA Bus Company (Regional/Express)
download_feed "mtabc" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip"

echo "All downloads processed."
