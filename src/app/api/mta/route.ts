import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const stopId = searchParams.get('stopId');
    const direction = searchParams.get('direction'); // 'N' or 'S', or 'East'/'West' for LIRR?
    const clientApiKey = request.headers.get('x-mta-api-key') || undefined;
    const serverApiKey = process.env.MTA_API_KEY;

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
    if (isSubwayOrRail) {
        effectiveKey = undefined;
    }

    try {
        const feedRouteId = routeId === 'PATH' ? 'PATH' : (routeId.startsWith('LIRR') ? 'LIRR' : (routeId.startsWith('MNR') ? 'MNR' : routeId));
        console.log(`[API] Fetching feed for routeId=${routeId} stopId=${stopId} type=${feedRouteId}`);
        const feedResponse = await MtaService.fetchFeed(feedRouteId, effectiveKey, stopId);

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

                        // DEBUG LOGGING for MNR
                        if (routeId.startsWith('MNR')) {
                            const stopIds = entity.tripUpdate.stopTimeUpdate.map((u: any) => u.stopId).join(', ');
                            console.log(`[MNR Debug] Trip=${entityRouteId} Stops=${stopIds}`);
                        }

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

                                // Extract Track (Try various standard/extension paths)
                                // MNR often puts track in extension? Or relying on platform in stopId?
                                let track = 'TBD';
                                // Try checking if track is available in extensions (hypothetical accessor)
                                // For now, we will leave as TBD or parse from raw if we knew structure.

                                arrivals.push({
                                    routeId: entityRouteId,
                                    time: arrivalTime,
                                    minutesUntil: Math.floor((arrivalTime - now) / 60),
                                    destination: entity.tripUpdate.trip.tripHeadsign || 'Unknown',
                                    track: track // Placeholder until we confirm track field location
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
