
import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const routeId = searchParams.get('routeId'); // New param

    const apiKey = request.headers.get('x-mta-api-key');
    const serverApiKey = process.env.MTA_API_KEY || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
    const effectiveKey = apiKey || serverApiKey;

    const clientPrefix = apiKey ? apiKey.substring(0, 4) + '...' : 'none';
    const serverPrefix = serverApiKey ? serverApiKey.substring(0, 4) + '...' : 'none';

    // Adjusted log to include routeId
    console.log(`[BusStops API] Query: '${query}', RouteID: '${routeId}'. ClientKey: ${clientPrefix}, ServerKey: ${serverPrefix}`);

    if ((!query && !routeId) || !effectiveKey) {
        return NextResponse.json({ error: 'Missing parameters (q or routeId) or API Key' }, { status: 400 });
    }

    try {
        let stops: any[] = [];

        if (routeId) {
            stops = await MtaService.getBusStops(routeId, effectiveKey);
        } else if (query) {
            stops = await MtaService.fetchBusStops(query, effectiveKey);
        }

        // Retry with Server Key if Client Key failed (and they are different)
        if (stops.length === 0 && apiKey && serverApiKey && apiKey !== serverApiKey) {
            console.log('[BusStops API] Client key failed or found nothing, retrying with Server Key...');
            if (routeId) {
                stops = await MtaService.getBusStops(routeId, serverApiKey);
            } else if (query) {
                stops = await MtaService.fetchBusStops(query, serverApiKey);
            }
        }

        return NextResponse.json({ stops });
    } catch (error) {
        console.error('Bus stop fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch bus stops' }, { status: 500 });
    }
}
