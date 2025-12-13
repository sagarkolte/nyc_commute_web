import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const stopId = searchParams.get('stopId');
    const direction = searchParams.get('direction'); // 'N' or 'S', or 'East'/'West' for LIRR?
    const clientApiKey = request.headers.get('x-mta-api-key');
    const serverMtaKey = process.env.MTA_API_KEY;

    // Determine if this is a Subway/Rail route that needs the primary MTA Key (api.mta.info)
    const isSubwayOrRail = routeId.startsWith('LIRR') ||
        routeId.startsWith('MNR') ||
        ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W', 'J', 'Z', 'L', 'G', 'S', 'SIR'].includes(routeId);

    // Prefer server-side MTA_API_KEY for Subway/Rail, fallback to client key (which might be the Bus Key)
    // For Bus, we use the client key passed from the frontend (NEXT_PUBLIC_MTA_BUS_API_KEY)
    let effectiveKey = clientApiKey;
    if (isSubwayOrRail && serverMtaKey) {
        effectiveKey = serverMtaKey;
    }

    if (!routeId || !stopId) {
        return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
    }

    try {
        const feedRouteId = routeId === 'PATH' ? 'PATH' : (routeId.startsWith('LIRR') ? 'LIRR' : (routeId.startsWith('MNR') ? 'MNR' : routeId));
        console.log(`[API] Fetching feed for routeId=${routeId} stopId=${stopId} type=${feedRouteId}`);
        const feedResponse = await MtaService.fetchFeed(feedRouteId, effectiveKey, stopId);

        const now = Date.now() / 1000;
        const arrivals: any[] = [];

        if (feedResponse.type === 'siri') {
            // SIRI JSON handling
            const delivery = feedResponse.data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
            if (delivery?.MonitoredStopVisit) {
                delivery.MonitoredStopVisit.forEach((visit: any) => {
                    const journey = visit.MonitoredVehicleJourney;
                    const call = journey?.MonitoredCall;
                    if (!call) return;

                    // Parse time (ISO string)
                    const expectedTime = call.ExpectedArrivalTime ? new Date(call.ExpectedArrivalTime).getTime() / 1000 : null;
                    const aimedTime = call.AimedArrivalTime ? new Date(call.AimedArrivalTime).getTime() / 1000 : null;
                    const arrivalTime = expectedTime || aimedTime;

                    if (arrivalTime && arrivalTime > now) {
                        arrivals.push({
                            routeId: journey.LineRef || routeId, // LineRef usually "MTA NYCT_M15"
                            time: arrivalTime,
                            minutesUntil: Math.floor((arrivalTime - now) / 60)
                        });
                    }
                });
            }
        } else {
            // GTFS handling (Subway / LIRR support)
            const feed = feedResponse.data;
            const targetStopId = (routeId === 'PATH' || routeId.startsWith('LIRR')) ? stopId : `${stopId}${direction}`;

            feed.entity.forEach((entity: any) => {
                if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
                    // LIRR/MNR/PATH filter or standard filter
                    if (routeId !== 'PATH' && !routeId.startsWith('LIRR') && !routeId.startsWith('MNR') && entity.tripUpdate.trip.routeId !== routeId) return;

                    entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate: any) => {
                        const isRail = routeId === 'PATH' || routeId.startsWith('LIRR') || routeId.startsWith('MNR');
                        const stopMatch = isRail ? stopUpdate.stopId === stopId : stopUpdate.stopId === targetStopId;

                        if (stopMatch) {
                            const arrivalTime = stopUpdate.arrival?.time?.low || stopUpdate.departure?.time?.low;
                            if (arrivalTime && arrivalTime > now) {
                                arrivals.push({
                                    routeId: entity.tripUpdate.trip.routeId,
                                    time: arrivalTime,
                                    minutesUntil: Math.floor((arrivalTime - now) / 60)
                                });
                            }
                        }
                    });
                }
            });
        }

        // Sort by time
        arrivals.sort((a, b) => a.time - b.time);

        return NextResponse.json({ arrivals: arrivals.slice(0, 3) });
    } catch (error) {
        console.error('[API] Error in MTA route:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
