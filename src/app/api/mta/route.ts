import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';
import mnrStations from '@/lib/mnr_stations.json';
import lirrStations from '@/lib/lirr_stations.json';
import pathStations from '@/lib/path_stations.json';
import nycFerryStations from '@/lib/nyc_ferry_stations.json';
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

        if (isRail && feedResponse.type === 'gtfs-raw') {
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
        const arrivals: any[] = [];

        // Debug stats
        let routeIdMatchCount = 0;
        let stopMatchCount = 0;
        let afterNowCount = 0;
        let feedEntityCount = (feedResponse.type === 'gtfs' && feedResponse.data.entity) ? feedResponse.data.entity.length : 0;
        let firstLineRef = ''; // Declare firstLineRef here
        let debugRaw = 'Init;';
        const foundStopIds = new Set<string>();
        let sampleEntity: any = null;

        if (feedResponse.type === 'siri') {
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
                                    // entityRouteId is const, so we rely on 'routeMatches' logic below.
                                    // Actually, we must force routeMatches = true if it matches.
                                    // But 'routeMatches' was calculated earlier.

                                    // Let's re-eval routeMatches for Ferry
                                    if (originUpdate) {
                                        // If we found the origin, we are good.
                                        // But wait, earlier 'routeMatches' was: const routeMatches = isRail ? true : entityRouteId === routeId;
                                        // For Ferry, isRail is true (in this code's logic? No, check line 63/182)
                                        // Line 182: const isRail = ... || routeId === 'nyc-ferry' ...
                                        // So routeMatches is ALWAYS TRUE for nyc-ferry in the original code. 
                                        // The filtering happens via 'originUpdate' presence.

                                        // The ISSUE: originUpdate is found, BUT destUpdate might be missing.
                                        // We need to keep this trip IF origin found AND inferred route matches.
                                        // And we need to Fabricate a destination arrival if missing.
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

                                arrivals.push({
                                    routeId: entityRouteId || (routeId === 'nyc-ferry' ? 'Ferry' : routeId),
                                    time: arrivalTime,
                                    destinationArrivalTime: destinationArrivalTime,
                                    minutesUntil: Math.floor((arrivalTime - now) / 60),
                                    destination: displayDest || 'Unknown',
                                    track: (routeId === 'nyc-ferry' || !!FERRY_ROUTES[routeId]) ? '' : track
                                });
                            }
                        }
                    }
                }
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
            }
        });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
