import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';
import mnrStations from '@/lib/mnr_stations.json';
import lirrStations from '@/lib/lirr_stations.json';
import pathStations from '@/lib/path_stations.json';
import nycFerryStations from '@/lib/nyc_ferry_stations.json';
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
        return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
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
        const isRail = routeId.startsWith('LIRR') || routeId.startsWith('MNR') || routeId === 'nyc-ferry';
        const feedRouteId = routeId === 'PATH' ? 'PATH' : (routeId === 'nyc-ferry' ? 'NYC_FERRY' : (routeId.startsWith('LIRR') ? 'LIRR' : (routeId.startsWith('MNR') ? 'MNR' : routeId)));
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
            // GTFS handling
            const feed = feedResponse.data;
            const targetStopId = (routeId === 'PATH' || routeId === 'nyc-ferry' || routeId.startsWith('LIRR') || routeId.startsWith('MNR')) ? stopId : `${stopId}${direction}`;
            const destStopId = searchParams.get('destStopId');

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
                    const isRail = routeId === 'PATH' || routeId === 'nyc-ferry' || routeId.startsWith('LIRR') || routeId.startsWith('MNR');
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

                        if (destStopId) {
                            // Origin-Destination filtering
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
                                            } else if (routeId === 'nyc-ferry') {
                                                const st = (nycFerryStations as any[]).find((s: any) => s.id === lastUpdate.stopId);
                                                if (st) displayDest = st.name;
                                            }
                                        }
                                    }
                                }

                                arrivals.push({
                                    routeId: entityRouteId || (routeId === 'nyc-ferry' ? 'Ferry' : ''),
                                    time: arrivalTime,
                                    destinationArrivalTime: destinationArrivalTime,
                                    minutesUntil: Math.floor((arrivalTime - now) / 60),
                                    destination: displayDest || 'Unknown',
                                    track: track
                                });
                            }
                        }
                    }
                }
            });
        }

        // Sort by time
        arrivals.sort((a, b) => a.time - b.time);

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
                foundStopIds: Array.from(foundStopIds).slice(0, 50),
                sampleEntity: routeId === 'nyc-ferry' ? sampleEntity : null
            }
        });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
