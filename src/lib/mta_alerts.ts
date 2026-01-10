import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts';
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds

interface CachedAlerts {
    timestamp: number;
    entities: any[];
}

let alertsCache: CachedAlerts | null = null;

export const MtaAlertsService = {
    /**
     * Fetches all alerts from the MTA Subway Alerts Feed.
     * Caches the result for CACHE_DURATION_MS.
     */
    getAllAlerts: async (): Promise<any[]> => {
        const now = Date.now();

        if (alertsCache && (now - alertsCache.timestamp < CACHE_DURATION_MS)) {
            return alertsCache.entities;
        }

        try {
            console.log(`[MTA Alerts] Fetching from ${ALERTS_URL}`);
            const response = await fetch(ALERTS_URL, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`Failed to fetch alerts: ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

            // Filter only entities that contain alerts
            const alertEntities = feed.entity.filter(e => !!e.alert);

            alertsCache = {
                timestamp: now,
                entities: alertEntities
            };

            return alertEntities;
        } catch (error) {
            console.error('[MTA Alerts] Error fetching alerts:', error);
            // Return cached data if available (even if stale), otherwise empty
            return alertsCache ? alertsCache.entities : [];
        }
    },

    /**
     * Get active alerts for a specific route.
     * @param routeId e.g. "W", "A", "4"
     */
    getAlertsForRoute: async (routeId: string): Promise<any[]> => {
        const allAlerts = await MtaAlertsService.getAllAlerts();

        return allAlerts.filter(entity => {
            if (!entity.alert || !entity.alert.informedEntity) return false;

            // Check if any informed entity matches the route
            return entity.alert.informedEntity.some((ie: any) => {
                return ie.routeId === routeId;
                // Note: Sometimes alerts are agency-wide or match multiple routes.
                // For now, strict routeId match is the safest MVP.
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
            description: getTranslation(a.descriptionText),
            // activePeriod: we could parse activePeriod if needed
        };
    });
}
