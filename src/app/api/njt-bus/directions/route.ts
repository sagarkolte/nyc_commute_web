
import { NextResponse } from 'next/server';
import { NjtBusV2Service } from '@/lib/njt_bus_v2';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const route = searchParams.get('route');

    if (!route) {
        return NextResponse.json({ error: 'Missing route' }, { status: 400 });
    }

    try {
        const directions = await NjtBusV2Service.getBusDirections(route);
        return NextResponse.json(directions);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
