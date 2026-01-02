import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';
import mnrStations from '@/lib/mnr_stations.json';
import lirrStations from '@/lib/lirr_stations.json';
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
        ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W', 'J', 'Z', 'L', 'G', 'S', 'SIR'].includes(routeId);

    let effectiveKey: string | undefined = clientApiKey || serverApiKey;

    // Logging for debugging key mismatch
    const clientKeyPrefix = clientApiKey ? clientApiKey.substring(0, 4) : 'none';
    const serverKeyPrefix = serverApiKey ? serverApiKey.substring(0, 4) : 'none';
    console.log(`[API] Route: ${routeId} Stop: ${stopId} ClientKey: ${clientKeyPrefix}, ServerKey: ${serverKeyPrefix}`);

    try {
        const isRail = routeId.startsWith('LIRR') || routeId.startsWith('MNR');
        const feedRouteId = routeId === 'PATH' ? 'PATH' : (routeId.startsWith('LIRR') ? 'LIRR' : (routeId.startsWith('MNR') ? 'MNR' : routeId));
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
                feedResponse = { type: 'gtfs', data: decoded };
            } else {
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
            const targetStopId = (routeId === 'PATH' || routeId.startsWith('LIRR') || routeId.startsWith('MNR')) ? stopId : `${stopId}${direction}`;
            const destStopId = searchParams.get('destStopId');

            const getTime = (t: any) => {
                if (t === null || t === undefined) return null;
                if (typeof t === 'number') return t;
                if (t && typeof t.low === 'number') return t.low;
                if (typeof t === 'string') return parseInt(t, 10);
                return null;
            };

            feed.entity.forEach((entity: any) => {
                if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                    const entityRouteId = entity.tripUpdate.trip.routeId;
                    const isRail = routeId === 'PATH' || routeId.startsWith('LIRR') || routeId.startsWith('MNR');
                    const routeMatches = isRail ? true : entityRouteId === routeId;

                    if (routeMatches) {
                        routeIdMatchCount++;

                        // DEBUG LOGGING (Can be toggled if needed, removing for prod)

                        const updates = entity.tripUpdate.stopTimeUpdate;
                        let originUpdate: any = null;

                        if (destStopId) {
                            // Origin-Destination filtering
                            const originIdx = updates.findIndex((u: any) => u.stopId === stopId);
                            const destIdx = updates.findIndex((u: any) => u.stopId === destStopId);

                            if (originIdx !== -1 && destIdx !== -1 && originIdx < destIdx) {
                                originUpdate = updates[originIdx];
                            }
                        } else {
                            // Standard single-stop filtering
                            originUpdate = updates.find((u: any) => isRail ? u.stopId === stopId : u.stopId === targetStopId);
                        }

                        if (originUpdate) {
                            stopMatchCount++;
                            const arrivalTime = getTime(originUpdate.arrival?.time) || getTime(originUpdate.departure?.time);

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
                                    const destUpdate = updates.find((u: any) => u.stopId === destStopId);
                                    if (destUpdate) {
                                        destinationArrivalTime = getTime(destUpdate.arrival?.time);
                                    }
                                }

                                // Determine Headsign for display
                                let displayDest = entity.tripUpdate.trip.tripHeadsign;
                                if (!displayDest || displayDest === '') {
                                    const lastUpdate = entity.tripUpdate.stopTimeUpdate[entity.tripUpdate.stopTimeUpdate.length - 1];
                                    if (lastUpdate) {
                                        if (routeId.startsWith('MNR')) {
                                            const st = mnrStations.find((s: any) => s.id === lastUpdate.stopId);
                                            if (st) displayDest = st.name;
                                        } else if (routeId.startsWith('LIRR')) {
                                            const st = (lirrStations as any[]).find((s: any) => s.id === lastUpdate.stopId);
                                            if (st) displayDest = st.name;
                                        }
                                    }
                                }

                                arrivals.push({
                                    routeId: entityRouteId,
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
                targetStopId: (routeId === 'PATH' || routeId.startsWith('LIRR')) ? stopId : `${stopId}${direction}`,
                firstLineRef,
                debugRaw
            }
        });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
