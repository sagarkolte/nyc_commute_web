
import { MtaService } from '@/lib/mta';
import { NextResponse } from 'next/server';
import { CommuteStorage } from '@/lib/storage';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    // Server-side environment key as fallback
    let apiKey = process.env.NEXT_PUBLIC_MTA_BUS_API_KEY || process.env.MTA_BUS_API_KEY;
    const clientKey = request.headers.get('x-mta-api-key');
    if (clientKey) apiKey = clientKey;

    if (!query) {
        return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    if (!apiKey) {
        return NextResponse.json({ error: 'API Key required' }, { status: 401 });
    }

    try {
        const routes = await MtaService.searchBusRoutes(query, apiKey);
        return NextResponse.json({ routes });
    } catch (error: any) {
        console.error('Bus Route Search Error:', error);
        return NextResponse.json({ error: 'Failed to fetch bus routes' }, { status: 500 });
    }
}
