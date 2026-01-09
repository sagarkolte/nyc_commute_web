import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import mtaBusIndex from './mta_bus_index.json';
import mtaBusStops from './mta_bus_stops.json';
import { fetchBusGtfs } from './mta_bus_gtfs';

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
    'LIRR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr',
    'MNR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr',
    'PATH': 'https://path.transitdata.nyc/gtfsrt',
    'NYC_FERRY': 'http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate',
};

// Bus support - Static Index + GTFS-RT
// Dropping legacy OBA API references as keys are incompatible.

export const MtaService = {
    searchBusRoutes: async (query: string, apiKey: string) => {
        // Fallback to Static Index search
        // (API Key ignored as index is local)
        const q = query.toLowerCase().trim();
        if (!q) return [];

        // Use mtaBusIndex
        const matches = (mtaBusIndex as any[]).filter(r => {
            const short = (r.shortName || '').toLowerCase();
            // const long = (r.longName || '').toLowerCase(); // Index currently mainly has IDs, longName is placeholder
            const id = (r.id || '').toLowerCase();
            return short.includes(q) || id.includes(q);
        });

        return matches.sort((a, b) => {
            const aShort = (a.shortName || '').toLowerCase();
            const bShort = (b.shortName || '').toLowerCase();

            // Exact match top
            if (aShort === q && bShort !== q) return -1;
            if (bShort === q && aShort !== q) return 1;

            // Starts with
            if (aShort.startsWith(q) && !bShort.startsWith(q)) return -1;
            if (bShort.startsWith(q) && !aShort.startsWith(q)) return 1;

            return aShort.localeCompare(bShort, undefined, { numeric: true });
        }).slice(0, 50);
    },

    getBusStops: async (routeId: string, apiKey: string) => {
        // Use Static Stop Index
        // Keys in mtaBuStops are likely Route IDs (e.g. "M23+", "Q115").
        // The input routeId might be "MTA NYCT_M23+".
        // We need to normalize.

        let stops = (mtaBusStops as any)[routeId];

        if (!stops) {
            // Try stripping "MTA NYCT_" or "MTABC_"
            const shortId = routeId.replace(/^MTA (NYCT_|BC_)/, '');
            stops = (mtaBusStops as any)[shortId];
        }

        if (!stops) {
            // Try matching via our helper index to find the GTFS Route ID?
            const routeDef = (mtaBusIndex as any[]).find(r => r.id === routeId);
            if (routeDef && routeDef.shortName) {
                stops = (mtaBusStops as any)[routeDef.shortName];
            }
        }

        if (stops) {
            return stops.map((s: any) => ({
                id: s.id,
                name: s.name,
                direction: s.direction || 'N/A',
                lat: s.lat,
                lon: s.lon,
                lines: [routeId]
            }));
        }

        // Fallback to "Any Stop" if missing from index (e.g. Express routes if payload failed)
        console.warn(`[MTA] Check Bus Stops: No static stops for ${routeId}`);
        return [
            {
                id: 'ANY',
                name: 'All Active Vehicles (Realtime)',
                direction: 'N/A',
                lat: 0,
                lon: 0,
                lines: [routeId],
                headsign: 'View Live Buses'
            }
        ];
    },

    fetchBusStops: async (query: string, apiKey: string) => {
        const routes = await MtaService.searchBusRoutes(query, apiKey);
        if (routes.length === 0) return [];
        return MtaService.getBusStops(routes[0].id, apiKey);
    },

    fetchFeed: async (routeId: string, apiKey?: string, stopId?: string, returnRaw: boolean = false) => {
        let url = FEED_URLS[routeId];

        // Check if it's a Bus Route (e.g. M23, Q115) from our index or heuristic
        const isBus = (mtaBusIndex as any[]).some(r => r.id === routeId || r.shortName === routeId) ||
            routeId.match(/^[M|B|Q|S|Bx][0-9]+/);

        if (!url && isBus) {
            // Use our new GTFS-RT fetcher
            try {
                const updates = await fetchBusGtfs(routeId);
                // Need to wrap in standard FeedMessage format or custom?
                // The app expects `feed.entity[...]`.
                // We will verify what `fetchBusGtfs` returns. 
                // Ah, `fetchBusGtfs` returns flat `BusDeparture[]`.
                // But the Caller (`route.ts`) expects a FeedMessage to parse `tripUpdate`.
                // Actually, `route.ts` calls `MtaService.fetchFeed` then processes it.
                // If we change return type here, we break `route.ts`.

                // Better: Have `fetchBusGtfs` return the RAW FeedMessage, 
                // OR construct a fake FeedMessage here from the parsed data?
                // Or just let `fetchBusGtfs` return the raw `feed` object (decoded protobuf)
                // and let `route.ts` filter it.

                // Simplest: `fetchBusGtfs` returns parsed simple objects.
                // We wrap them back into a mock GTFS structure so `route.ts` doesn't change too much, 
                // OR we handle a special `type: 'custom-bus'` response.

                return { type: 'custom-bus', data: updates };
            } catch (e) {
                console.error('[MTA] Bus GTFS Fail', e);
                throw e;
            }
        }

        // LIRR / MNR / PATH / Standard Subway
        if (routeId.startsWith('LIRR')) url = FEED_URLS['LIRR'];
        else if (routeId.startsWith('MNR')) url = FEED_URLS['MNR'];
        else if (routeId === 'PATH') url = FEED_URLS['PATH'];
        else if (routeId === 'NYC_FERRY') url = FEED_URLS['NYC_FERRY'];

        if (!url) throw new Error(`No feed URL found for route: ${routeId}`);

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
                throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
            }
            const buffer = await response.arrayBuffer();
            if (returnRaw) {
                return { type: 'gtfs-raw', data: buffer };
            }
            // @ts-ignore
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
            return { type: 'gtfs', data: feed };
        } catch (error) {
            console.error('Error fetching/parsing GTFS feed:', error);
            throw error;
        }
    }
};
