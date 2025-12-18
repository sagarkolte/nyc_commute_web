
import { NextResponse } from 'next/server';
import { NjtBusService } from '@/lib/njt_bus';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stopId');
    const destStopId = searchParams.get('destStopId');

    if (!stopId) {
        return NextResponse.json({ error: 'Missing stopId' }, { status: 400 });
    }

    try {
        const trips = await NjtBusService.getTripUpdates(stopId, destStopId || undefined);

        const arrivals = trips.map(t => ({
            routeId: t.routeId || 'Bus',
            time: Number(t.time),
            destination: t.headsign || 'Unknown',
            status: 'On Time' // GTFS-RT might have delay, but simple for now
        }));

        return NextResponse.json({ arrivals });
    } catch (e: any) {
        console.error('NJT Bus API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
