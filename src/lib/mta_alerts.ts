import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const SUBWAY_ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts';
const BUS_ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fbus-alerts';
const LIRR_ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr_gtfs_realtime_alerts';
const MNR_ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr_gtfs_realtime_alerts';

const CACHE_DURATION_MS = 60 * 1000; // 60 seconds

interface CachedAlerts {
    timestamp: number;
    entities: any[];
}

// Separate caches for each feed
const cache: Record<string, CachedAlerts | null> = {
    subway: null,
    bus: null,
    lirr: null,
    mnr: null
};

export const MtaAlertsService = {
    /**
     * Generic fetcher for a specific alert feed
     */
    fetchFeed: async (feedKey: 'subway' | 'bus' | 'lirr' | 'mnr', url: string, apiKey?: string): Promise<any[]> => {
        const now = Date.now();
        const currentCache = cache[feedKey];

        if (currentCache && (now - currentCache.timestamp < CACHE_DURATION_MS)) {
            return currentCache.entities;
        }

        try {
            // console.log(`[MTA Alerts] Fetching ${feedKey} from ${url}`);
            const headers: Record<string, string> = {};
            if (apiKey) headers['x-api-key'] = apiKey;

            const response = await fetch(url, { cache: 'no-store', headers });

            if (!response.ok) {
                console.warn(`[MTA Alerts] Failed to fetch ${feedKey}: ${response.status}`);
                return currentCache ? currentCache.entities : [];
            }

            const buffer = await response.arrayBuffer();
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

            // Filter only entities that contain alerts
            const alertEntities = feed.entity.filter(e => !!e.alert);

            cache[feedKey] = {
                timestamp: now,
                entities: alertEntities
            };

            return alertEntities;
        } catch (error) {
            console.error(`[MTA Alerts] Error fetching ${feedKey} alerts:`, error);
            return currentCache ? currentCache.entities : [];
        }
    },

    /**
     * Get active alerts for a specific route.
     * Automatically determines which feed to check.
     * @param routeId e.g. "W", "A", "M15", "LIRR", "MNR"
     */
    getAlertsForRoute: async (routeId: string, apiKey?: string): Promise<any[]> => {
        let feedKey: 'subway' | 'bus' | 'lirr' | 'mnr' = 'subway';
        let url = SUBWAY_ALERTS_URL;

        // Determine Feed based on Route Pattern
        if (routeId.startsWith('LIRR')) {
            feedKey = 'lirr';
            url = LIRR_ALERTS_URL;
        } else if (routeId.startsWith('MNR')) {
            feedKey = 'mnr';
            url = MNR_ALERTS_URL;
        } else if (routeId.toUpperCase() === 'SIR' || routeId === 'SI') {
            // SIR is usually in Subway feed (checked via script, assuming yes for now based on standard GTFS)
            feedKey = 'subway';
            url = SUBWAY_ALERTS_URL;
        } else if (
            // Bus Heuristic:
            // 1. Starts with typical bus prefixes: M, B, Q, S, X, SIM (+ number)
            // 2. Or is a known bus route ID like "MTA NYCT_M15+"
            // 3. Or generic check: If it's NOT a subway line (1 char or specific 2 char)
            routeId.includes('MTA NYCT') ||
            routeId.includes('Bus') ||
            (routeId.length > 2 && !['SIR', 'LIRR', 'PATH'].includes(routeId)) || // Long IDs often bus
            /^[MBQSX]\d+/.test(routeId) // Starts with borough letter + digit
        ) {
            feedKey = 'bus';
            url = BUS_ALERTS_URL;
        }

        // Special override: If route matches a standard subway line, force subway
        const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W', 'J', 'Z', 'G', 'L', 'S', 'SF', 'SR', 'SIR', 'SI'];
        if (SUBWAY_LINES.includes(routeId)) {
            feedKey = 'subway';
            url = SUBWAY_ALERTS_URL;
        }

        const allAlerts = await MtaAlertsService.fetchFeed(feedKey, url, apiKey);

        return allAlerts.filter(entity => {
            if (!entity.alert || !entity.alert.informedEntity) return false;

            // Check if any informed entity matches the route
            return entity.alert.informedEntity.some((ie: any) => {
                const entityRouteId = ie.routeId;
                if (!entityRouteId) return false;

                // Exact match
                if (entityRouteId === routeId) return true;

                // Flexible match for Bus (e.g. "MTA NYCT_M15" vs "M15")
                if (feedKey === 'bus') {
                    return entityRouteId.includes(routeId) || routeId.includes(entityRouteId);
                }

                // Flexible match for SIR
                if ((routeId === 'SI' || routeId === 'SIR') && (entityRouteId === 'SI' || entityRouteId === 'SIR')) {
                    return true;
                }

                return false;
            });
        });
    }
};

// Helper to extract text from GTFS-RT TranslatedString
function getTranslation(trans: any): string {
    if (!trans || !trans.translation) return '';
    const t = trans.translation.find((tr: any) => tr.language === 'en' || tr.language === 'en-html');
    return t ? t.text : (trans.translation[0]?.text || '');
}

// Helper to simplify alert object
export function formatAlerts(entities: any[]) {
    return entities.map(e => {
        const a = e.alert;
        return {
            header: getTranslation(a.headerText),
            // description: getTranslation(a.descriptionText), // User requested to hide full description
        };
    });
}
