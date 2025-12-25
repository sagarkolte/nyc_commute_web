import { NextResponse } from 'next/server';
import { MtaService } from '@/lib/mta';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const apiKey = request.headers.get('x-mta-api-key');
    const serverApiKey = process.env.MTA_API_KEY || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY;
    const effectiveKey = apiKey || serverApiKey;

    if (!query || !effectiveKey) {
        return NextResponse.json({ error: 'Missing query or API Key' }, { status: 400 });
    }

    try {
        let stops = await MtaService.fetchBusStops(query, effectiveKey);

        // Retry with Server Key if Client Key failed (and they are different)
        if (stops.length === 0 && apiKey && serverApiKey && apiKey !== serverApiKey) {
            console.log('[BusStops API] Client key failed or found nothing, retrying with Server Key...');
            stops = await MtaService.fetchBusStops(query, serverApiKey);
        }

        return NextResponse.json({ stops });
    } catch (error) {
        console.error('Bus stop fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch bus stops' }, { status: 500 });
    }
}
