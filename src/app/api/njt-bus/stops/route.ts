
import { NextResponse } from 'next/server';
import { NjtBusV2Service } from '@/lib/njt_bus_v2';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const route = searchParams.get('route');
    const direction = searchParams.get('direction');

    if (!route || !direction) {
        return NextResponse.json({ error: 'Missing route or direction' }, { status: 400 });
    }

    try {
        const stops = await NjtBusV2Service.getStops(route, direction);
        return NextResponse.json(stops);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
