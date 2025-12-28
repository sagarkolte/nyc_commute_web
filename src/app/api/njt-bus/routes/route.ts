
import { NextResponse } from 'next/server';
import { NjtBusV2Service } from '@/lib/njt_bus_v2';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const routes = await NjtBusV2Service.getBusRoutes();
        return NextResponse.json(routes);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
