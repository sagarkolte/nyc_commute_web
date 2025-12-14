import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';

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
        const feedEntityCount = (feedResponse.type === 'gtfs' && feedResponse.data.entity) ? feedResponse.data.entity.length : 0;

        if (feedResponse.type === 'siri') {
            // ... (keep siri logic, maybe add stats if needed, but assuming GTFS for subway)
            const delivery = feedResponse.data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
            if (delivery?.MonitoredStopVisit) {
                delivery.MonitoredStopVisit.forEach((visit: any) => {
                    const journey = visit.MonitoredVehicleJourney;
                    // ... existing logic ...
                    const call = journey?.MonitoredCall;
                    if (!call) return;
                    const expectedTime = call.ExpectedArrivalTime ? new Date(call.ExpectedArrivalTime).getTime() / 1000 : null;
                    const aimedTime = call.AimedArrivalTime ? new Date(call.AimedArrivalTime).getTime() / 1000 : null;
                    const arrivalTime = expectedTime || aimedTime;
                    if (arrivalTime && arrivalTime > now) {
                        arrivals.push({
                            routeId: journey.LineRef || routeId,
                            time: arrivalTime,
                            minutesUntil: Math.floor((arrivalTime - now) / 60)
                        });
                    }
                });
            }
        } else {
            // GTFS handling
            const feed = feedResponse.data;
            const targetStopId = (routeId === 'PATH' || routeId.startsWith('LIRR')) ? stopId : `${stopId}${direction}`;

            const getTime = (t: any) => {
                if (t === null || t === undefined) return null;
                if (typeof t === 'number') return t;
                if (t && typeof t.low === 'number') return t.low;
                if (typeof t === 'string') return parseInt(t, 10);
                return null;
            };

            feed.entity.forEach((entity: any) => {
                if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                    // Check Route ID
                    const entityRouteId = entity.tripUpdate.trip.routeId;

                    const isRail = routeId === 'PATH' || routeId.startsWith('LIRR') || routeId.startsWith('MNR');
                    const routeMatches = (routeId === 'PATH' || routeId.startsWith('LIRR') || routeId.startsWith('MNR')) ? true : entityRouteId === routeId;

                    if (routeMatches) {
                        routeIdMatchCount++;
                        entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate: any) => {
                            const stopMatch = isRail ? stopUpdate.stopId === stopId : stopUpdate.stopId === targetStopId;
                            if (stopMatch) {
                                stopMatchCount++;
                                const arrivalTime = getTime(stopUpdate.arrival?.time) || getTime(stopUpdate.departure?.time);

                                if (arrivalTime && arrivalTime > now) {
                                    afterNowCount++;
                                    arrivals.push({
                                        routeId: entityRouteId,
                                        time: arrivalTime,
                                        minutesUntil: Math.floor((arrivalTime - now) / 60)
                                    });
                                }
                            }
                        });
                    }
                }
            });
        }

        // Sort by time
        arrivals.sort((a, b) => a.time - b.time);

        return NextResponse.json({
            arrivals: arrivals.slice(0, 3),
            debug: {
                feedEntityCount,
                routeIdMatchCount,
                stopMatchCount,
                afterNowCount,
                serverTime: now,
                targetStopId: (routeId === 'PATH' || routeId.startsWith('LIRR')) ? stopId : `${stopId}${direction}`
            }
        });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
