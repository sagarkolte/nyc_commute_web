import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';
import { MtaAlertsService } from '@/lib/mta_alerts';
import mnrStations from '@/lib/mnr_stations.json';
import lirrStations from '@/lib/lirr_stations.json';
import pathStations from '@/lib/path_stations.json';
import nycFerryStations from '@/lib/nyc_ferry_stations.json';
import { getNextLirrTrainsById } from '@/lib/lirr_sql';
import { getNextFerryTripsByDirection } from '@/lib/ferry_sql';
import { FERRY_ROUTES } from '@/lib/ferry_routes';
import * as protobuf from 'protobufjs';
import path from 'path';

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
        console.error('[API] Failed to load protobuf:', e);
        return null;
    }
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const stopId = searchParams.get('stopId');
    const direction = searchParams.get('direction'); // 'N' or 'S', or 'East'/'West' for LIRR?
    const clientApiKey = request.headers.get('x-mta-api-key') || undefined;
    const serverApiKey = process.env.MTA_API_KEY || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;

    if (!routeId || !stopId) {
        console.warn(`[API] Missing params - routeId: ${routeId}, stopId: ${stopId}`);
        return NextResponse.json({
            error: 'Missing required params',
            details: { routeId: !!routeId, stopId: !!stopId }
        }, { status: 400 });
    }

    // Bus feeds still require a key. We use client key if provided, else server key.
    // Subway/Rail feeds (GTFS-RT) are now public and require NO key.
    // We explicitly pass undefined for them to ensure no invalid key header is sent.

    const isSubwayOrRail = routeId.startsWith('LIRR') ||
        routeId.startsWith('MNR') ||
        routeId === 'PATH' ||
        routeId === 'nyc-ferry' ||
        ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W', 'J', 'Z', 'L', 'G', 'S', 'SIR'].includes(routeId);

    let effectiveKey: string | undefined = clientApiKey || serverApiKey;

    // Logging for debugging key mismatch
    const clientKeyPrefix = clientApiKey ? clientApiKey.substring(0, 4) : 'none';
    const serverKeyPrefix = serverApiKey ? serverApiKey.substring(0, 4) : 'none';
    console.log(`[API] Route: ${routeId} Stop: ${stopId} ClientKey: ${clientKeyPrefix}, ServerKey: ${serverKeyPrefix}`);

    try {
        const isRail = routeId.startsWith('LIRR') || routeId.startsWith('MNR') || routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId];
        const feedRouteId = routeId === 'PATH' ? 'PATH' : ((routeId === 'nyc-ferry' || FERRY_ROUTES[routeId]) ? 'NYC_FERRY' : (routeId.startsWith('LIRR') ? 'LIRR' : (routeId.startsWith('MNR') ? 'MNR' : routeId)));
        console.log(`[API] Fetching feed for routeId=${routeId} stopId=${stopId} type=${feedRouteId}`);

        let feedResponse;
        try {
            feedResponse = await MtaService.fetchFeed(feedRouteId, effectiveKey, stopId, isRail);
        } catch (e: any) {
            if (e.message?.includes('403') && serverApiKey && effectiveKey !== serverApiKey) {
                console.log(`[API] Client key failed with 403, retrying with Server Key...`);
                feedResponse = await MtaService.fetchFeed(feedRouteId, serverApiKey, stopId, isRail);
            } else {
                throw e;
            }
        }

        if (isRail && feedResponse.type === 'gtfs-raw' && feedResponse.data instanceof ArrayBuffer) {
            const root = await getProtobufRoot();
            if (root) {
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                const decoded = FeedMessage.decode(new Uint8Array(feedResponse.data)) as any;
                console.log(`[API] Decoded protobuf rail feed: ${decoded.entity?.length || 0} entities`);
                feedResponse = { type: 'gtfs', data: decoded };
            } else {
                console.warn(`[API] Protobuf root failed, falling back to standard fetch`);
                // Fallback to standard if protobuf fails
                feedResponse = await MtaService.fetchFeed(feedRouteId, effectiveKey, stopId, false);
            }
        }

        const now = Date.now() / 1000;
        let arrivals: any[] = [];

        // HYBRID FERRY: Pre-fill with Schedule
        if (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) {
            // We need to support 'nyc-ferry' (generic) too? 
            // getScheduledFerryArrivals handles generic via FERRY_SCHEDULE lookup.
            // But we only have 'East River' schedule.
            // If routeId is 'nyc-ferry', we can't reliably guess schedule unless we assume East River.
            // But existing route inference logic infers it LATER.

            // Strategy: Only pre-fill if specific route is requested OR if we want to default generic to something.
            // Given user specifically asked for "East River" in UI, routeId should be 'East River'.
            arrivals = getScheduledFerryArrivals(routeId, stopId, now, direction);
        } else if (routeId.startsWith('LIRR') || routeId.startsWith('MNR')) {
            // LIRR (and eventually MNR) Schedule Fallback
            if (routeId.startsWith('LIRR')) {
                // Get destStopId from params?
                const destStopId = searchParams.get('destStopId');
                if (destStopId) {
                    const scheduled = getScheduledRailArrivals(routeId, stopId, destStopId, now);
                    arrivals = scheduled;
                }
            }
        }

        // Fetch Alerts for the route
        let alerts: any[] = [];
        try {
            // Only fetch for Subway lines (MTA NYCT) for now as that's what the service covers
            // The service URL is subway-alerts.
            // Fetch Alerts for all supported modes (Services logic handles filtering)
            if (isSubwayOrRail || routeId.includes('Bus') || /^[MBQSX]\d+/.test(routeId) || routeId.includes('MTA NYCT')) {
                // Determine if we should skip strictly unsupported ones (like generic NYC Ferry if we don't have a feed)
                // But our service handles 'generic' fallbacks, so let's try.
                // Exclude PATH as it doesn't have GTFS-RT alerts via the generic service yet.
                if (routeId !== 'PATH') {
                    const rawAlerts = await MtaAlertsService.getAlertsForRoute(routeId, effectiveKey);
                    alerts = require('@/lib/mta_alerts').formatAlerts(rawAlerts);
                }
            }
        } catch (e) {
            console.error('[API] Failed to fetch alerts', e);
        }

        // Debug stats
        let routeIdMatchCount = 0;
        let stopMatchCount = 0;
        let afterNowCount = 0;
        let feedEntityCount = (feedResponse.type === 'gtfs' && feedResponse.data.entity) ? feedResponse.data.entity.length : 0;
        let firstLineRef = ''; // Declare firstLineRef here
        let debugRaw = 'Init;';
        const foundStopIds = new Set<string>();
        let sampleEntity: any = null;

        if (feedResponse.type === 'custom-bus') {
            // Custom GTFS-RT Bus Processor
            debugRaw += 'Type=MBus;';
            const updates = feedResponse.data; // BusDeparture[]
            feedEntityCount = updates.length;

            updates.forEach((u: any) => {
                // Check Stop Match
                if (String(u.stopId) === String(stopId)) {
                    stopMatchCount++;
                    const arrivalTime = u.time / 1000;
                    const diff = arrivalTime - now;

                    if (arrivalTime > now) {
                        afterNowCount++;
                        arrivals.push({
                            routeId: u.routeId,
                            time: arrivalTime,
                            minutesUntil: Math.floor(diff / 60),
                            destination: 'Unknown' // Bus GTFS-RT doesn't easily give headsign per stop
                        });
                    }
                }

                // Debug first match
                if (arrivals.length === 1 && afterNowCount === 1) {
                    debugRaw += `First=${u.routeId}@${u.time};`;
                }
            });

        } else if (feedResponse.type === 'siri') {
            debugRaw += 'Type=Siri;';
            const delivery = feedResponse.data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
            console.log(`[BusDebug] Request: routeId=${routeId} stopId=${stopId} now=${now}`);
            if (delivery?.MonitoredStopVisit) {
                feedEntityCount = delivery.MonitoredStopVisit.length;
                debugRaw += `Visits=${feedEntityCount};`;
                delivery.MonitoredStopVisit.forEach((visit: any, idx: number) => {
                    if (idx === 0) {
                        debugRaw += `V0Keys=${Object.keys(visit).join(',')};`;
                        if (visit.MonitoredVehicleJourney) {
                            debugRaw += `JourneyFound;LineRef=${visit.MonitoredVehicleJourney.LineRef};`;
                        } else {
                            debugRaw += `NoJourney;`;
                        }
                    }

                    const journey = visit.MonitoredVehicleJourney;
                    const lineRef = journey?.LineRef || '';
                    const pubName = journey?.PublishedLineName || '';
                    if (idx === 0) firstLineRef = lineRef; // Capture first lineRef for debug

                    // Robust matching: Check exact ID, Published Name, or if one is a substring of the other (for ID variations)
                    // This handles cases like "M23-SBS" vs "MTA NYCT_M23+" if the user saved a short name,
                    // or if the ID has a prefix/suffix we didn't expect.
                    // We ensure we don't match "M2" to "M23" by ensuring boundaries or sufficient length, 
                    // but M23 vs BM1 is distinct enough.
                    const isMatch = lineRef === routeId ||
                        pubName === routeId ||
                        (routeId.length > 3 && lineRef.includes(routeId)) ||
                        (lineRef.length > 3 && routeId.includes(lineRef));

                    if (idx === 0) {
                        debugRaw += `Match=${isMatch};Ref=${lineRef};Req=${routeId};`;
                    }

                    const call = journey?.MonitoredCall;
                    const expectedTime = call?.ExpectedArrivalTime ? new Date(call.ExpectedArrivalTime).getTime() / 1000 : null;
                    const aimedTime = call?.AimedArrivalTime ? new Date(call.AimedArrivalTime).getTime() / 1000 : null;
                    const arrivalTime = expectedTime || aimedTime;
                    const diff = arrivalTime ? arrivalTime - now : 'N/A';

                    console.log(`[BusDebug] Visit: LineRef=${lineRef} Pub=${pubName} Match=${isMatch} Time=${arrivalTime} Diff=${diff}`);

                    if (isMatch) {
                        routeIdMatchCount++;

                        if (!call) return;
                        if (arrivalTime && arrivalTime > now) {
                            arrivals.push({
                                routeId: journey.LineRef || routeId,
                                time: arrivalTime,
                                minutesUntil: Math.floor((arrivalTime - now) / 60)
                            });
                        }
                    }
                });
            }
        } else {
            const feed = feedResponse.data;
            const isRailFeed = (routeId === 'PATH' || routeId === 'nyc-ferry' || routeId.startsWith('LIRR') || routeId.startsWith('MNR'));
            const targetStopId = isRailFeed ? stopId : (direction ? `${stopId}${direction}` : stopId);
            const destStopId = searchParams.get('destStopId');
            console.log(`[GTFS] Processing ${feed.entity?.length || 0} entities for ${routeId}. Target: ${targetStopId} (Raw: ${stopId}, Dir: ${direction}) Dest: ${destStopId || 'none'}. Now: ${now}`);

            const getTime = (t: any) => {
                if (t === null || t === undefined) return null;
                if (typeof t === 'number') return t;
                if (t && typeof t.low === 'number') return t.low;
                if (typeof t === 'string') return parseInt(t, 10);
                return null;
            };

            feed.entity.forEach((entity: any, idx: number) => {
                if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                    const entityRouteId = entity.tripUpdate.trip.routeId;
                    const isRail = routeId === 'PATH' || routeId === 'nyc-ferry' || routeId.startsWith('LIRR') || routeId.startsWith('MNR') || !!FERRY_ROUTES[routeId];
                    const routeMatches = isRail ? true : entityRouteId === routeId;

                    if (entity.tripUpdate.stopTimeUpdate) {
                        entity.tripUpdate.stopTimeUpdate.forEach((u: any) => {
                            if (u.stopId) foundStopIds.add(String(u.stopId));
                        });
                    }
                    if (!sampleEntity) sampleEntity = entity;

                    if (routeMatches) {
                        routeIdMatchCount++;

                        // DEBUG LOGGING (Can be toggled if needed, removing for prod)

                        const updates = entity.tripUpdate.stopTimeUpdate;
                        let originUpdate: any = null;

                        // --- NYC FERRY ROUTE INFERENCE ---
                        const ferryStops = FERRY_ROUTES[routeId];
                        if (ferryStops) {
                            // 1. Loose OD matching for sparse ferry feeds
                            // If we requested a specific line (e.g. "East River"), check if this trip's stops belong to it.
                            const tripStopIds = updates.map((u: any) => String(u.stopId));
                            // We require at least one stop to match the definition
                            const matchesLine = tripStopIds.some((s: string) => ferryStops.includes(s));

                            if (matchesLine) {
                                // 2. Found Origin?
                                const originIdx = updates.findIndex((u: any) => String(u.stopId) === String(stopId));
                                if (originIdx !== -1) {
                                    // 3. Dest Check (Relaxed)
                                    // If strict dest check fails, we still allow it IF the line matches
                                    if (destStopId) {
                                        const destIdx = updates.findIndex((u: any) => String(u.stopId) === String(destStopId));

                                        // Case A: Standard Match (Both present)
                                        if (destIdx !== -1 && originIdx < destIdx) {
                                            originUpdate = updates[originIdx];
                                        }
                                        // Case B: Sparse Feed (Dest missing, but inferred line is correct)
                                        else if (destIdx === -1) {
                                            // The boat is at Origin, going... somewhere.
                                            // Since we matched the LINE (East River), and the user wants East River, 
                                            // we assume it's going the right way relative to the static definition.
                                            // Optional: Check direction against static sequence? 
                                            // For now, simple inclusion is infinitely better than "No Info".
                                            originUpdate = updates[originIdx];
                                        }
                                    } else {
                                        originUpdate = updates[originIdx];
                                    }
                                }
                            }
                        } else if (destStopId) {
                            // Standard OD filtering for other modes
                            const originIdx = updates.findIndex((u: any) => String(u.stopId) === String(stopId));
                            const destIdx = updates.findIndex((u: any) => String(u.stopId) === String(destStopId));

                            if (originIdx !== -1 && destIdx !== -1 && originIdx < destIdx) {
                                originUpdate = updates[originIdx];
                            } else if (routeId === 'PATH' && originIdx !== -1) {
                                // Relaxed matching for sparse PATH feed
                                // 0: NYC-bound (Towards WTC or 33rd), 1: NJ-bound (Towards NWK, JSQ, HOB)
                                const tripDir = entity.tripUpdate.trip.directionId;
                                const nycStops = ['26734', '26724', '26723', '26722', '26725', '26726'];
                                const njStops = ['26733', '26731', '26730', '26728', '26729', '26727', '26732'];

                                const destIsNyc = nycStops.includes(destStopId);
                                const destIsNj = njStops.includes(destStopId);

                                if ((destIsNyc && tripDir === 0) || (destIsNj && tripDir === 1)) {
                                    originUpdate = updates[originIdx];
                                }
                            } else if (routeId === 'nyc-ferry' && originIdx !== -1) {
                                // Permissive matching for Ferry: if we are at origin, show it even if dest is missing
                                // since ferry feeds are very sparse and sometimes only show next 2 stops.
                                originUpdate = updates[originIdx];
                            } else if (routeId === 'PATH' && originIdx === -1 && destStopId) {
                                // Terminal Departure Proxy Logic
                                // If the user is at a terminal (e.g. 33rd) and the trip has no 33rd stop 
                                // but its FIRST reported stop is the very next stop (e.g. 23rd).
                                const tripDir = entity.tripUpdate.trip.directionId;
                                const nycStops = ['26734', '26724', '26723', '26722', '26725', '26726'];
                                const njStops = ['26733', '26731', '26730', '26728', '26729', '26727', '26732'];
                                const destIsNyc = nycStops.includes(destStopId);
                                const destIsNj = njStops.includes(destStopId);

                                const isCorrectDir = (destIsNyc && tripDir === 0) || (destIsNj && tripDir === 1);
                                if (isCorrectDir && updates.length > 0) {
                                    const firstStopId = updates[0].stopId;
                                    const adjacents: Record<string, string[]> = {
                                        '26724': ['26723'], // 33rd -> 23rd
                                        '26734': ['26727'], // WTC -> Exchange
                                        '26733': ['26729'], // NWK -> Harrison
                                        '26730': ['26726', '26732', '26727'], // HOB -> Christopher/Newport/Exchange
                                        '26731': ['26728', '26727', '26729'], // JSQ -> Grove/Exchange/Harrison
                                    };

                                    if (adjacents[stopId]?.includes(firstStopId)) {
                                        // Use the first reported stop (the adjacent one) as a proxy
                                        originUpdate = updates[0];
                                    }
                                }
                            } else if ((routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) && destStopId) {
                                // NYC FERRY RELAXED FILTERING
                                // Standard logic above requires trip to contain [Origin ... Dest].
                                // But ferry feeds are sparse. If we see [Origin ...], we should accept it.

                                if (originIdx !== -1) {
                                    // If destination is also there, check order
                                    const destIdx = updates.findIndex((u: any) => String(u.stopId) === String(destStopId));
                                    if (destIdx !== -1) {
                                        // Both present. Ensure Origin < Dest
                                        if (originIdx < destIdx) {
                                            originUpdate = updates[originIdx];
                                        }
                                    } else {
                                        // Dest missing. Relaxed match -> Accept Origin.
                                        originUpdate = updates[originIdx];
                                    }
                                }
                            }
                        } else {
                            // Standard single-stop filtering
                            originUpdate = updates.find((u: any) => isRail ? String(u.stopId) === String(stopId) : String(u.stopId) === String(targetStopId));
                        }

                        // --- NYC FERRY ROUTE INFERENCE ---
                        if (routeId === 'nyc-ferry' || Object.values(FERRY_ROUTES).some(stops => updates.some((u: any) => stops.includes(String(u.stopId))))) {
                            // Can we infer the route of this trip?
                            // Iterate all known ferry routes
                            // If this trip contains a sequence of stops unique to or characteristic of a route, tag it.
                            // Simplified: If this trip contains >= 2 stops from a defined route definition, assume it's that route.
                            // Even better: Check if the *requested* routeId (e.g. "East River") contains the stops in this update.

                            // 1. Get the requested route definition from query (if passed as routeId like 'East River')
                            // Note: routeId param might be "nyc-ferry" if not strict, or "East River" if strict.
                            // But here 'routeId' variable is what was passed in query.

                            let requestedFerryRouteStops = FERRY_ROUTES[routeId];

                            // Dynamic Inference for generic 'nyc-ferry' requests
                            if (!requestedFerryRouteStops && routeId === 'nyc-ferry') {
                                const tripStops = updates.map((u: any) => String(u.stopId));
                                // Find first route def that allows all these stops
                                const matchName = Object.keys(FERRY_ROUTES).find(key => {
                                    const def = FERRY_ROUTES[key];
                                    if (tripStops.length === 0) return false;
                                    return tripStops.every((s: string) => def.includes(s));
                                });
                                if (matchName) requestedFerryRouteStops = FERRY_ROUTES[matchName];
                            }

                            if (requestedFerryRouteStops) {
                                // The user requested a specific Ferry Line (e.g. East River).
                                // Does this trip belong to East River?
                                // Check if the stops in this update exist in the East River definition.
                                // We need at least 1 match, but ideally 2 to be sure of direction/line if stops are shared.
                                // However, most ferry stops are shared. 
                                // Best check: Are ALL observed stops in this update part of the East River line?
                                const tripStops = updates.map((u: any) => String(u.stopId));
                                const isMatch = tripStops.every((s: string) => requestedFerryRouteStops.includes(s));

                                if (isMatch) {
                                    // It IS an East River boat (or at least compatible).
                                    // Override entityRouteId so it passes the check

                                    // RELAXED FILTERING:
                                    // If we are dealing with a generic 'nyc-ferry' request (where we inferred the route),
                                    // OR even a specific request where the feed is sparse:
                                    // We MUST keep the trip if the ORIGIN is present, even if the destination is missing.

                                    const originInStops = updates.some((u: any) => String(u.stopId) === String(stopId));
                                    if (originInStops) {
                                        // Force match. The standard filtering below might kill it if destStopId is missing from updates.
                                        // But we can't easily skip standard filtering from here.
                                        // However, standard filtering uses: if (destStopId) { ... }

                                        // If we want to support "No Info" fix, we simply need to ensure we don't return early?
                                        // Actually, the main loop continues.
                                        // But 'entityRouteId' needs to match 'routeId'.
                                        // For generic 'nyc-ferry', routeId is 'nyc-ferry'.
                                        // We need to set entityRouteId to 'nyc-ferry' to pass the "routeMatches" check later?
                                        // Wait, 'routeMatches' is calculated at the top: const routeMatches = ...
                                        // If routeId is 'nyc-ferry', routeMatches is ALREADY true.

                                        // The problem is likely that later on, 'stopMatchCount' is only incremented if originUpdate is found.
                                        // And then if destStopId is set, does it filter?
                                        // Line 372: if (destStopId) { ... destinationArrivalTime = ... }
                                        // It DOES NOT filter. It just tries to find arrival time.

                                        // So where is it being filtered?
                                        // Ah! 'originUpdate' calculation.
                                        // Line ~290: 
                                        // if (destStopId) { ... if (originIdx < destIdx) ... else if (routeId === 'nyc-ferry') ... }

                                        // This BLOCK (lines 282-300 in original?) handles finding 'originUpdate'.
                                        // If destStopId is set, it REQUIRES destIdx !== -1 unless routeId === 'nyc-ferry'.

                                        // MY NEW CODE IS BELOW THAT BLOCK.
                                        // So 'originUpdate' is ALREADY null if dest was missing and routeId != 'nyc-ferry'.
                                        // BUT routeId IS 'nyc-ferry' for the user!

                                        // Wait, if routeId === 'nyc-ferry', the logic at 296 says:
                                        // } else if (routeId === 'nyc-ferry' && originIdx !== -1) { originUpdate = ... }

                                        // So it SHOULD have worked.

                                        // UNLESS... 'checkRoute(entity)' returned false?
                                        // routeId='nyc-ferry'. isRail=true. routeMatches=true.

                                        // Let's re-read the "Find Origin" block CAREFULLY.
                                    }
                                }
                            }
                        }

                        if (originUpdate) {
                            stopMatchCount++;
                            const arrivalTime = getTime(originUpdate.arrival?.time) || getTime(originUpdate.departure?.time);

                            if (idx === 0) debugRaw += `FirstMatchTime=${arrivalTime};Now=${now};`;

                            if (arrivalTime && arrivalTime > now) {
                                afterNowCount++;

                                // Extract Track
                                let track = 'TBD';
                                const extKey = '.transit_realtime.mtaRailroadStopTimeUpdate';
                                const ext = originUpdate[extKey] || originUpdate.mtaRailroadStopTimeUpdate || originUpdate.mta_railroad_stop_time_update;
                                if (ext && ext.track) {
                                    track = ext.track;
                                }

                                // Extract Destination Arrival Time
                                let destinationArrivalTime = null;
                                if (destStopId) {
                                    const destUpdate = updates.find((u: any) => String(u.stopId) === String(destStopId));
                                    if (destUpdate) {
                                        destinationArrivalTime = getTime(destUpdate.arrival?.time);
                                    }
                                }

                                // Determine Headsign for display
                                let displayDest = entity.tripUpdate.trip.tripHeadsign;
                                if (!displayDest || displayDest === '') {
                                    // Use user's selected destination name if available and it's a PATH route
                                    if (routeId === 'PATH' && destStopId) {
                                        const st = (pathStations as any[]).find((s: any) => s.id === destStopId);
                                        if (st) displayDest = st.name;
                                    }

                                    if (!displayDest || displayDest === '') {
                                        // NYC Ferry Route Inference for Destination
                                        const ferryStops = FERRY_ROUTES[routeId];
                                        if (ferryStops && updates.length > 0) {
                                            const firstStopId = String(updates[0].stopId);
                                            const lastStopId = String(updates[updates.length - 1].stopId);
                                            const firstIdx = ferryStops.indexOf(firstStopId);
                                            const lastIdx = ferryStops.indexOf(lastStopId);

                                            if (firstIdx !== -1 && lastIdx !== -1) {
                                                let destId = '';
                                                // If moving forward (or staying same), dest is last stop of route
                                                if (firstIdx <= lastIdx) {
                                                    destId = ferryStops[ferryStops.length - 1];
                                                } else {
                                                    // Moving backward, dest is first stop of route
                                                    destId = ferryStops[0];
                                                }
                                                const st = (nycFerryStations as any[]).find((s: any) => s.id === destId);
                                                if (st) displayDest = st.name;
                                            }
                                        }

                                        // Fallback logic
                                        if (!displayDest || displayDest === '') {
                                            const lastUpdate = entity.tripUpdate.stopTimeUpdate[entity.tripUpdate.stopTimeUpdate.length - 1];
                                            if (lastUpdate) {
                                                if (routeId.startsWith('MNR')) {
                                                    const st = mnrStations.find((s: any) => s.id === lastUpdate.stopId);
                                                    if (st) displayDest = st.name;
                                                } else if (routeId.startsWith('LIRR')) {
                                                    const st = (lirrStations as any[]).find((s: any) => s.id === lastUpdate.stopId);
                                                    if (st) displayDest = st.name;
                                                } else if (routeId === 'PATH') {
                                                    const st = (pathStations as any[]).find((s: any) => s.id === lastUpdate.stopId);
                                                    if (st) displayDest = st.name;
                                                } else if (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) {
                                                    const st = (nycFerryStations as any[]).find((s: any) => s.id === lastUpdate.stopId);
                                                    if (st) displayDest = st.name;
                                                }
                                            }
                                        }
                                    }
                                }

                                const newArrival = {
                                    routeId: entityRouteId || (routeId === 'nyc-ferry' ? 'Ferry' : routeId),
                                    time: arrivalTime,
                                    destinationArrivalTime: destinationArrivalTime,
                                    minutesUntil: Math.floor((arrivalTime - now) / 60),
                                    destination: displayDest || 'Unknown',
                                    track: (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) ? '' : track,
                                    status: (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) ? 'Live' : undefined
                                };

                                // HYBRID MERGE for Ferry
                                let matched = false;
                                if (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) {
                                    const matchIdx = arrivals.findIndex(a => a.type === 'schedule' && Math.abs(a.time - arrivalTime) < 1200);
                                    if (matchIdx !== -1) {
                                        // Update Schedule Slot
                                        arrivals[matchIdx] = { ...newArrival, type: 'realtime', status: 'Live' };
                                        matched = true;
                                    }
                                }

                                arrivals.push(newArrival);
                            }
                        }
                    }
                }
            });
        }

        // HYBRID MERGE for LIRR Fallback (similar to Ferry)
        if (routeId.startsWith('LIRR')) {
            // We have 'arrivals' which might contain Scheduled items (from top) AND Live items (pushed above).
            // We want to dedup.
            // Strategy:
            // 1. Separate Live vs Schedule
            const live = arrivals.filter(a => a.status !== 'Scheduled');
            let scheduled = arrivals.filter(a => a.status === 'Scheduled');

            // 2. Hydrate/Filter
            scheduled = scheduled.filter(sch => {
                // Check if there is a matching Live trip (same time window)
                // Or if it's in the past and not matched.
                const match = live.find(l => Math.abs(l.time - sch.time) < 1800); // 30 min window?
                if (match) {
                    // Live trip exists for this slot. Use Live.
                    return false;
                }
                // Keep schedule if in future
                return sch.time > now;
            });

            arrivals = [...live, ...scheduled];
        }

        // Filter out stale scheduled trips (Ferry only)
        if (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) {
            arrivals = arrivals.filter(a => {
                if (a.type === 'schedule') {
                    // Keep only future scheduled trips. Past ones that didn't match are assumed departed.
                    return a.time >= now;
                }
                return true;
            });
        }

        // Sort by time
        arrivals.sort((a, b) => a.time - b.time);

        console.log(`[GTFS] Done. Matches: ${stopMatchCount}, AfterNow: ${afterNowCount}, Total: ${arrivals.length}`);

        return NextResponse.json({
            arrivals: arrivals.slice(0, 3),
            debugInfo: {
                feedEntityCount,
                routeIdMatchCount,
                stopMatchCount,
                afterNowCount,
                serverTime: now,
                targetStopId: (routeId === 'PATH' || routeId === 'nyc-ferry' || routeId.startsWith('LIRR') || routeId.startsWith('MNR')) ? stopId : `${stopId}${direction}`,
                firstLineRef,
                debugRaw,
                foundStopIds: Array.from(foundStopIds).slice(0, 100),
                sampleEntity: routeId === 'nyc-ferry' ? sampleEntity : null,
                metrics: {
                    stopMatchCount,
                    afterNowCount,
                    totalArrivalsRaw: arrivals.length
                }
            },
            alerts: alerts // Return alerts array
        });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}

// Helper for Hybrid Ferry Schedule (SQL)
function getScheduledFerryArrivals(routeId: string, stopId: string, now: number, direction: string | null): any[] {
    let dirId = 0;
    if (direction === 'N') dirId = 1;
    else if (direction === 'S') dirId = 0;
    else if (direction) {
        const parsed = parseInt(direction);
        if (!isNaN(parsed)) dirId = parsed;
    }

    // SQL Query
    const trips = getNextFerryTripsByDirection(stopId, dirId, 15);

    return trips.map(t => {
        const time = getNycTimestamp(now, t.origin_time);

        // Filter out past trips (grace period 5 mins)
        if (time < now - 300) return null;

        return {
            routeId: routeId, // Keep generic or specific? Use passed routeId.
            time: time,
            destinationArrivalTime: null,
            minutesUntil: Math.floor((time - now) / 60),
            destination: t.headsign,
            type: 'schedule',
            tripId: `SQL-${t.trip_id}`,
            status: 'Scheduled',
            track: ''
        };
    }).filter(Boolean);
}

// Helper for LIRR/Rail Schedule Fallback (SQL)
function getScheduledRailArrivals(routeId: string, originId: string, destId: string, now: number): any[] {
    // SQL Query
    const trips = getNextLirrTrainsById(originId, destId, 10);

    return trips.map(t => {
        const time = getNycTimestamp(now, t.origin_time);
        let destTime = null;
        if (t.dest_time) {
            destTime = getNycTimestamp(now, t.dest_time);
        }

        if (time < now - 300) return null;

        return {
            routeId: routeId,
            time: time,
            destinationArrivalTime: destTime,
            minutesUntil: Math.floor((time - now) / 60),
            destination: t.headsign,
            type: 'schedule',
            tripId: `SQL-${t.trip_id}`,
            status: 'Scheduled',
            track: ''
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
