
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FEED_URL = 'http://gtfsrt.prod.obanyc.com/tripUpdates';
const KEY = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;

// Cache the feed to avoid hitting API too often (bus feed is large)
let cachedFeed: any = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

export interface BusDeparture {
    routeId: string;
    tripId: string;
    stopId?: string;
    stopSequence?: number;
    time?: number; // Epoch
    delay?: number;
}

export const fetchBusGtfs = async (targetRouteId?: string): Promise<BusDeparture[]> => {
    const now = Date.now();
    if (!cachedFeed || (now - lastFetchTime > CACHE_DURATION)) {
        try {
            console.log(`[BusGTFS] Fetching Feed...`);
            const res = await fetch(`${FEED_URL}?key=${KEY}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const buffer = await res.arrayBuffer();
            cachedFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
            lastFetchTime = now;
            console.log(`[BusGTFS] Updated Cache with ${cachedFeed.entity.length} entities.`);
        } catch (e) {
            console.error('[BusGTFS] Fetch Failed', e);
            // Return empty or old cache if available?
            if (!cachedFeed) return [];
        }
    }

    if (!cachedFeed) return [];

    const departures: BusDeparture[] = [];

    // Filter
    cachedFeed.entity.forEach((e: any) => {
        if (e.tripUpdate && e.tripUpdate.trip) {
            const tr = e.tripUpdate.trip;
            const routeId = tr.routeId;

            // Optional filtering
            if (targetRouteId && routeId !== targetRouteId && routeId !== `MTA NYCT_${targetRouteId}` && routeId !== `MTABC_${targetRouteId}`) {
                return;
            }

            // Extract Stop Times
            if (e.tripUpdate.stopTimeUpdate) {
                e.tripUpdate.stopTimeUpdate.forEach((stu: any) => {
                    // We extract all stops for this trip
                    const time = stu.arrival?.time || stu.departure?.time;
                    if (time) {
                        departures.push({
                            routeId: routeId,
                            tripId: tr.tripId,
                            stopId: stu.stopId,
                            stopSequence: stu.stopSequence,
                            time: Number(time) * 1000,
                            delay: stu.arrival?.delay
                        });
                    }
                });
            }
        }
    });

    return departures;
};
