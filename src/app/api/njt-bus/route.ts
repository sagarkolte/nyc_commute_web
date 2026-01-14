
import { NextResponse } from 'next/server';
import { NjtBusV2Service } from '@/lib/njt_bus_v2';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stopId');
    const routeId = searchParams.get('routeId');
    const direction = searchParams.get('direction');

    if (!stopId) {
        return NextResponse.json({ error: 'Missing stopId' }, { status: 400 });
    }

    try {
        // Use the new V2 Service
        const trips = await NjtBusV2Service.getArrivals(stopId, routeId || '', direction || '');

        const arrivals = trips.map(t => ({
            routeId: t.public_route || 'Bus',
            time: Date.now() / 1000 + (NjtBusV2Service.parseMinutes(t.departuretime) * 60),
            minutesUntil: NjtBusV2Service.parseMinutes(t.departuretime),
            destination: t.header || 'Unknown',
            status: t.departuretime,
            isRealtime: true
        }));

        return NextResponse.json({ arrivals });
    } catch (e: any) {
        console.error('NJT Bus API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
