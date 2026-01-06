import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FEED_URLS: Record<string, string> = {
    // Number lines
    '1': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '2': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '3': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '4': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '5': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '6': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    '7': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    'S': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    // Blue lines
    'A': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    'C': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    'E': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    // Yellow lines
    'N': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    'Q': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    'R': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    'W': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    // Orange lines
    'B': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    'D': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    'F': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    'M': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    // L train
    'L': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
    // G train
    'G': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
    // J/Z trains
    'J': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
    'Z': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
    // LIRR (No Key required for this feed URL based on recent research, or handled via headers)
    // Actually, per plan, we might need to handle LIRR differently if it's a different proto format.
    // But standard GTFS-RT should work.
    'LIRR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr',
    'MNR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr',
    'PATH': 'https://path.transitdata.nyc/gtfsrt',
    'NYC_FERRY': 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate',
};

// Bus requires API Key and uses a different base URL usually, but let's try the modern endpoint scheme first.
// If user provides a key, we might need to append it or use a header.
// For now, we'll assume the user might provide a custom URL or Key in headers.

// Bus support
const OBA_BASE = 'http://bustime.mta.info/api/where';
const SIRI_BASE = 'http://bustime.mta.info/api/siri';

export const MtaService = {
    searchBusRoutes: async (query: string, apiKey: string) => {
        const agencies = ['MTA NYCT', 'MTABC'];
        let allRoutes: any[] = [];

        // 1. Parallel fetch for speed
        await Promise.all(agencies.map(async (agency) => {
            try {
                // Determine URL based on agency if needed, but OBA handles it via param
                const url = `${OBA_BASE}/routes-for-agency/${encodeURIComponent(agency)}.json?key=${apiKey}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.data?.list) {
                        allRoutes.push(...data.data.list);
                    }
                }
            } catch (e) {
                console.warn(`[MTA] Failed to fetch routes for ${agency}`, e);
            }
        }));

        const queryLower = query.toLowerCase().trim();
        if (!queryLower) return [];

        // 2. Filter matches
        // Exact match -> Starts with -> Includes
        const matches = allRoutes.filter((r: any) => {
            const short = (r.shortName || '').toLowerCase();
            const long = (r.longName || '').toLowerCase();
            const id = (r.id || '').toLowerCase();
            return short.includes(queryLower) || id.includes(queryLower) || long.includes(queryLower);
        });

        // 3. Sort for relevance
        return matches.sort((a, b) => {
            const aShort = (a.shortName || '').toLowerCase();
            const bShort = (b.shortName || '').toLowerCase();

            // Exact matches to top
            if (aShort === queryLower && bShort !== queryLower) return -1;
            if (bShort === queryLower && aShort !== queryLower) return 1;

            // Starts-with to top
            const aStarts = aShort.startsWith(queryLower);
            const bStarts = bShort.startsWith(queryLower);
            if (aStarts && !bStarts) return -1;
            if (bStarts && !aStarts) return 1;

            // Alphanumeric sort
            return aShort.localeCompare(bShort, undefined, { numeric: true });
        }).slice(0, 50); // Limit results
    },

    getBusStops: async (routeId: string, apiKey: string) => {
        // Stops for specific route
        const url = `${OBA_BASE}/stops-for-route/${encodeURIComponent(routeId)}.json?key=${apiKey}&includePolylines=false`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`OBA API Error: ${res.status}`);

            const data = await res.json();
            if (!data?.data?.stops) return [];

            const stops = data.data.stops;
            const stopGroupings = data.data.stopGroupings || [];
            const stopHeadsignMap: Record<string, string> = {};

            // Map stops to destinations
            stopGroupings.forEach((grouping: any) => {
                grouping.stopGroups?.forEach((sg: any) => {
                    const destName = sg.name?.name;
                    if (destName) {
                        let cleanName = destName.replace('SELECT BUS ', '').trim();
                        // Title case
                        cleanName = cleanName.toLowerCase().replace(/(?:^|\s|["'([{])+\S/g, (match: string) => match.toUpperCase());

                        sg.stopIds?.forEach((stopId: string) => {
                            stopHeadsignMap[stopId] = `To ${cleanName}`;
                        });
                    }
                });
            });

            return stops.map((s: any) => ({
                id: s.id,
                name: s.name,
                direction: s.direction,
                lat: s.lat,
                lon: s.lon,
                lines: s.routeIds || s.routes?.map((r: any) => r.id) || [],
                headsign: stopHeadsignMap[s.id] || 'Bus Stop'
            }));
        } catch (e) {
            console.error(`[MTA] Failed to get stops for route ${routeId}`, e);
            throw e;
        }
    },

    // Legacy support (redirects to search + get first match logic, or just deprecated)
    // We'll keep a simplified version that mimics old behavior if anything else uses it, 
    // but the UI will switch to the new methods.
    fetchBusStops: async (query: string, apiKey: string) => {
        // Re-implement using new methods to save code
        // 1. Search
        const routes = await MtaService.searchBusRoutes(query, apiKey);
        if (routes.length === 0) return [];

        // 2. Pick first match
        const bestMatch = routes[0];

        // 3. Get stops
        return MtaService.getBusStops(bestMatch.id, apiKey);
    },

    fetchFeed: async (routeId: string, apiKey?: string, stopId?: string, returnRaw: boolean = false) => {
        let url = FEED_URLS[routeId];

        // Dynamic Bus URL generation if route ID looks like a bus (e.g. M15) and isn't in static map
        if (!url && routeId.length > 1 && !['SI', 'LIRR'].includes(routeId)) {
            if (!apiKey) throw new Error('API Key required for Bus');
            if (!stopId) throw new Error('Stop ID required for Bus real-time');

            // SIRI StopMonitoring
            // http://bustime.mta.info/api/siri/stop-monitoring.json?key=...&MonitoringRef=...
            const siriUrl = `${SIRI_BASE}/stop-monitoring.json?key=${apiKey}&MonitoringRef=${stopId}&version=2`;

            try {
                // console.log('[MTA] Fetching SIRI:', siriUrl.replace(apiKey, 'LikelyValidKey'));
                const res = await fetch(siriUrl, { cache: 'no-store' });
                if (!res.ok) {
                    const txt = await res.text();
                    console.error('[MTA] SIRI Failed:', res.status, txt);
                    throw new Error(`SIRI fetch failed: ${res.status}`);
                }
                const data = await res.json();
                return { type: 'siri', data };
            } catch (e) {
                console.error('SIRI error:', e);
                throw e;
            }
        }

        // LIRR and MNR special cases
        if (routeId.startsWith('LIRR')) {
            url = FEED_URLS['LIRR'];
        } else if (routeId.startsWith('MNR')) {
            url = FEED_URLS['MNR'];
        } else if (routeId === 'PATH') {
            url = FEED_URLS['PATH'];
        } else if (routeId === 'NYC_FERRY') {
            url = FEED_URLS['NYC_FERRY'];
        }

        if (!url) {
            throw new Error(`No feed URL found for route: ${routeId}`);
        }

        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        if (apiKey) {
            headers['x-api-key'] = apiKey;
        }

        try {
            console.log(`[MTA] Fetching GTFS feed from ${url}`);
            const response = await fetch(url, { cache: 'no-store', headers });
            if (!response.ok) {
                const errorText = await response.text();
                // console.error(`[MTA] HTTP error ${response.status}: ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
            }
            const buffer = await response.arrayBuffer();
            console.log(`[MTA] Raw buffer size: ${buffer.byteLength} bytes`);
            if (returnRaw) {
                return { type: 'gtfs-raw', data: buffer };
            }
            // @ts-ignore
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
            console.log(`[MTA] Parsed ${feed.entity?.length || 0} entities from feed`);
            return { type: 'gtfs', data: feed };
        } catch (error) {
            console.error('Error fetching/parsing GTFS feed:', error);
            throw error;
        }
    }
};
