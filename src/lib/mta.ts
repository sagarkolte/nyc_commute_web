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
    fetchBusStops: async (query: string, apiKey: string) => {
        // OneBusAway - Stops for location (or search)
        // Actually, OBA search API is better: /api/where/stops-for-location.json?lat=...&lon=...
        // But we want search by name. OBA has no direct "search by name" for stops easily documented in standard OBA without location.
        // However, we can try searching for route first, then listing stops.
        // Simplifying: We'll use the 'stops-for-route' if the user types a route name (e.g. M15),
        // or we might need a different strategy.

        // Actually, let's use the 'stops-for-location' with a wide radius if we had lat/lon.
        // Without location, searching is hard.
        // Let's implement 'stops-for-route' as the primary "search" for now.
        // User types "M15" -> we fetch route "MTA NYCT_M15" -> then fetch stops.

        const agencies = ['MTA NYCT', 'MTABC'];
        let routes: any[] = [];

        for (const agency of agencies) {
            try {
                const routeRes = await fetch(`${OBA_BASE}/routes-for-agency/${encodeURIComponent(agency)}.json?key=${apiKey}`);
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    if (routeData?.data?.list) {
                        routes = [...routes, ...routeData.data.list];
                    }
                }
            } catch (e) {
                console.warn(`[MTA] Failed to fetch routes for agency ${agency}:`, e);
            }
        }

        const queryLower = query.toLowerCase();
        // Priority match: startsWith, then includes
        let matchedRoute = routes.find((r: any) => r.shortName.toLowerCase().startsWith(queryLower));
        if (!matchedRoute) {
            matchedRoute = routes.find((r: any) => r.shortName.toLowerCase().includes(queryLower));
        }

        if (matchedRoute) {
            const stopsRes = await fetch(`${OBA_BASE}/stops-for-route/${encodeURIComponent(matchedRoute.id)}.json?key=${apiKey}&includePolylines=false`);

            if (!stopsRes.ok) {
                console.warn(`[MTA] stops-for-route failed: ${stopsRes.status}`);
                return [];
            }

            const stopsData = await stopsRes.json();

            // Validate stopsData
            if (!stopsData || !stopsData.data) {
                console.warn('[MTA] Invalid data from stops-for-route');
                return [];
            }

            // OBA stops-for-route structure found:
            // data.stops: The actual stops array (flattened)
            // data.stopGroupings: groups stops by direction/destination

            const stopGroupings = stopsData.data.stopGroupings || [];
            const stopHeadsignMap: Record<string, string> = {}; // StopID -> "To Destination"

            stopGroupings.forEach((grouping: any) => {
                grouping.stopGroups?.forEach((sg: any) => {
                    const destName = sg.name?.name;
                    if (destName) {
                        // "SELECT BUS CHELSEA PIERS..." -> "To Chelsea Piers"
                        // Heuristic: Remove "SELECT BUS " and " CROSSTOWN"?
                        // Or just use the raw name for now, let UI format it?
                        // Let's clean it up slightly: Title Case + strip "SELECT BUS" if present.
                        let cleanName = destName.replace('SELECT BUS ', '').trim();
                        // Capitalize first letter of each word (simple title case)
                        cleanName = cleanName.toLowerCase().replace(/(?:^|\s|["'([{])+\S/g, (match: string) => match.toUpperCase());

                        sg.stopIds?.forEach((stopId: string) => {
                            stopHeadsignMap[stopId] = `To ${cleanName}`;
                        });
                    }
                });
            });

            const stops = stopsData.data.stops;

            if (!stops) {
                console.warn('OBA stops API returned no stops for match:', matchedRoute.id);
                return [];
            }

            return stops.map((s: any) => ({
                id: s.id,
                name: s.name,
                direction: s.direction,
                lat: s.lat,
                lon: s.lon,
                lines: s.routeIds || s.routes?.map((r: any) => r.id) || [],
                headsign: stopHeadsignMap[s.id]
            }));
        }
        return [];
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
