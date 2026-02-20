import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';
import { getNjtDepartures, NjtDeparture } from '@/lib/njt';
import { NjtBusV2Service, NjtBusV2Departure } from '@/lib/njt_bus_v2';
import { getNextFerryTripsByDirection } from '@/lib/ferry_sql';
import * as protobuf from 'protobufjs';
import path from 'path';

// --- Protobuf Setup (Same as mta/route.ts) ---
let cachedRoot: protobuf.Root | null = null;
async function getProtobufRoot() {
    if (cachedRoot) return cachedRoot;
    const protoPath = path.join(process.cwd(), 'src/lib/proto');
    try {
        cachedRoot = await protobuf.load([
            path.join(protoPath, 'gtfs-realtime.proto'),
            path.join(protoPath, 'gtfs-realtime-MTARR.proto')
        ]);
        return cachedRoot;
    } catch (e) {
        console.error('[Batch] Failed to load protobuf:', e);
        return null;
    }
}

export const dynamic = 'force-dynamic';

interface BatchRequestItem {
    id: string; // Client ID to map response back
    mode: string;
    routeId: string;
    stopId: string;
    direction?: string; // 'N', 'S', 'Inbound', 'Outbound'
    destination?: string; // For NJT filter
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const items = body.requests as BatchRequestItem[];

        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Invalid requests array' }, { status: 400 });
        }

        const promises = items.map(async (item) => {
            try {
                const result = await processItem(item);
                return { id: item.id, ...result };
            } catch (e: any) {
                console.error(`[Batch] Error processing item ${item.id}:`, e);
                return { id: item.id, etas: [], error: e.message };
            }
        });

        const results = await Promise.all(promises);

        // Convert to map for easy lookup
        const responseMap: Record<string, any> = {};
        results.forEach(r => responseMap[r.id] = r);

        return NextResponse.json({ results: responseMap });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

async function processItem(item: BatchRequestItem) {
    const { mode, routeId, stopId, direction } = item;

    // --- NJ TRANSIT BUS (V2) ---
    if (mode === 'njt-bus') {
        const arrivals = await NjtBusV2Service.getArrivals(stopId, routeId, direction || '');
        const now = Date.now();
        const arrivalsTs: number[] = [];
        const etas = arrivals.map(a => {
            const mins = NjtBusV2Service.parseMinutes(a.departuretime);
            if (mins >= 0) {
                arrivalsTs.push(Math.floor(now / 1000) + (mins * 60));
            }
            return `${mins} min`;
        });
        return { etas, arrivals: arrivalsTs.slice(0, 3), raw: arrivals.slice(0, 3) };
    }

    // --- NJ TRANSIT RAIL ---
    if (mode === 'njt' || mode === 'njt-rail') {
        const deps = await getNjtDepartures(stopId, item.destination); // Using destination as 'destStopId' if needed, or filter later

        // Filter by Line (RouteId)
        // NjtDeparture has 'line' property e.g. "Line Northeast Corridor" or "Line ML"
        // But routeId passed might be "Northeast Corridor" or short code.
        // It's safer to not filter too aggressively if routeId format mismatches.
        // But the Widget usually wants a specific line.

        // Filter matches
        const matches = deps.filter(d => transformNjtLine(d.line) === transformNjtLine(routeId) || d.line.includes(routeId));

        const now = Date.now();
        const arrivalsTs: number[] = [];
        const etas = matches.map(d => {
            const timeMs = new Date(d.time).getTime();
            const diff = timeMs - now;
            const mins = Math.max(0, Math.floor(diff / 60000));
            arrivalsTs.push(Math.floor(timeMs / 1000));
            return `${mins} min`;
        });
        return { etas, arrivals: arrivalsTs.slice(0, 3), raw: matches.slice(0, 3) };
    }

    // --- SI FERRY ---
    if (mode === 'si-ferry') {
        const { getNextSiFerryDepartures } = await import('@/lib/si_ferry');
        // direction 'N' (Manhattan) -> stopId should be st-george (going TO whitehall)?
        // Wait, the Add Page logic:
        // Dir N -> stopId 'st-george', dest 'whitehall' (Manhattan)
        // Dir S -> stopId 'whitehall', dest 'st-george' (Staten Island)
        // So stopId passed here IS the origin. Perfect.

        const departures = getNextSiFerryDepartures(stopId);

        const etas = departures.map(d => `${d.minutesUntil} min`);
        const arrivals = departures.map(d => Math.floor(d.time.getTime() / 1000));

        return { etas, arrivals, raw: departures };
    }

    // --- MTA SUBWAY / LIRR / MNR / PATH / FERRY ---
    // Mapping Logic derived from mta/route.ts
    const isRail = mode === 'lirr' || mode === 'mnr' || mode === 'nyc-ferry' || mode === 'path';
    const feedRouteId = mode === 'path' ? 'PATH' : (mode === 'nyc-ferry' ? 'NYC_FERRY' : (mode === 'lirr' ? 'LIRR' : (mode === 'mnr' ? 'MNR' : routeId)));

    // Detect API Key
    const serverApiKey = process.env.MTA_API_KEY || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;

    let feedResponse = await MtaService.fetchFeed(feedRouteId, serverApiKey, stopId, isRail);

    // Decode Protobuf if needed
    if (isRail && feedResponse.type === 'gtfs-raw' && feedResponse.data instanceof ArrayBuffer) {
        const root = await getProtobufRoot();
        if (root) {
            const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
            try {
                const decoded = FeedMessage.decode(new Uint8Array(feedResponse.data)) as any;
                feedResponse = { type: 'gtfs', data: decoded };
            } catch (e) {
                // Fallback catch
            }
        }
    }

    const now = Date.now() / 1000;
    const etas: string[] = [];
    const arrivalsTs: number[] = [];
    const destinationName = "Unknown"; // TODO: Extract headsign

    if (feedResponse.type === 'gtfs') {
        const feed = feedResponse.data as any;
        if (feed.entity) {
            feed.entity.forEach((entity: any) => {
                if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                    const trip = entity.tripUpdate.trip;
                    const routeMatch = isRail ? true : (trip.routeId === routeId);

                    if (routeMatch) {
                        entity.tripUpdate.stopTimeUpdate.forEach((u: any) => {
                            let isStopMatch = false;
                            const updateStopId = String(u.stopId);

                            if (updateStopId === stopId) isStopMatch = true;
                            if (direction && updateStopId === `${stopId}${direction}`) isStopMatch = true;

                            if (isStopMatch) {
                                const time = getTime(u.arrival?.time) || getTime(u.departure?.time);
                                if (time && time > now) {
                                    const mins = Math.max(0, Math.floor((time - now) / 60));
                                    etas.push(`${mins} min`);
                                    arrivalsTs.push(time);
                                }
                            }
                        });
                    }
                }
            });
        }
    } else if (feedResponse.type === 'custom-bus') {
        // Bus Logic from mta/route.ts
        const updates = feedResponse.data as any[];
        updates.forEach((u: any) => {
            if (String(u.stopId) === String(stopId)) {
                const arrivalTime = u.time / 1000;
                if (arrivalTime > now) {
                    const mins = Math.max(0, Math.floor((arrivalTime - now) / 60));
                    etas.push(`${mins} min`);
                    arrivalsTs.push(arrivalTime);
                }
            }
        });
    }

    // Fallback: If Ferry and no realtime data, check schedule
    if (mode === 'nyc-ferry' && arrivalsTs.length === 0) {
        const scheduled = getScheduledFerryArrivals(routeId, stopId, now, direction);
        scheduled.forEach((s: any) => {
            arrivalsTs.push(s.time);
        });
    }

    // Sort by timestamp
    arrivalsTs.sort((a, b) => a - b);

    // Regenerate ETAs to match sorted timestamps
    const sortedEtas = arrivalsTs.map(ts => {
        const diff = ts - now;
        const mins = Math.max(0, Math.floor(diff / 60));
        return `${mins} min`;
    });

    return { etas: sortedEtas.slice(0, 3), arrivals: arrivalsTs.slice(0, 3) };
}

function getTime(t: any): number | null {
    if (t === null || t === undefined) return null;
    if (typeof t === 'number') return t;
    if (t && typeof t.low === 'number') return t.low;
    if (typeof t === 'string') return parseInt(t, 10);
    return null;
}

function transformNjtLine(line: string) {
    return line.replace('Line ', '').toLowerCase().trim();
}

// --- Helpers ---

// Helper for Hybrid Ferry Schedule (SQL)
function getScheduledFerryArrivals(routeId: string, stopId: string, now: number, direction: string | undefined): any[] {
    let dirId = 0; // Default S
    if (direction === 'N') dirId = 1;
    else if (direction === 'S') dirId = 0;

    // SQL Query
    const trips = getNextFerryTripsByDirection(stopId, dirId, 5);

    return trips.map(t => {
        const time = getNycTimestamp(now, t.origin_time);

        // Filter out past trips (grace period 5 mins)
        if (time < now - 300) return null;

        return {
            time: time,
            minutesUntil: Math.floor((time - now) / 60)
        };
    }).filter(Boolean);
}

// Timezone Helper
function getNycTimestamp(nowSeconds: number, targetMins: number): number {
    const serverNow = new Date(nowSeconds * 1000);
    const nycStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nycDateAsLocal = new Date(nycStr);

    // Offset = True UTC - Local Interpretation
    const tzOffsetMs = serverNow.getTime() - nycDateAsLocal.getTime();

    const h = Math.floor(targetMins / 60);
    const m = targetMins % 60;

    const targetLocal = new Date(nowSeconds * 1000); // Start with Today
    targetLocal.setHours(h, m, 0, 0); // Set wall clock

    // Apply offset
    return (targetLocal.getTime() + tzOffsetMs) / 1000;
}
