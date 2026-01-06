
import { GET } from '../src/app/api/mta/route';
import { NextResponse } from 'next/server';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Mock Request
class MockRequest {
    url: string;
    headers: Map<string, string>;

    constructor(url: string) {
        this.url = url;
        this.headers = new Map();
    }
}

async function testFerry() {
    console.log('--- Testing Ferry API Route Inference ---');

    // 1. Test "East River" from "Pier 11" (87)
    // We expect this to FIND trips even if they don't explicitly list a destination,
    // assuming assess_ferry.ts showed trips at 87 going to 20 (Dumbo).
    const url = 'http://localhost/api/mta?routeId=East River&stopId=87&direction=N';
    const req = new MockRequest(url) as any;
    req.headers.set('x-mta-api-key', process.env.MTA_API_KEY || '');

    try {
        const res = await GET(req);
        if (!res.ok) {
            console.error('API returned error:', res.status);
            return;
        }

        const data = await res.json();
        console.log('Status:', res.status);
        if (data.arrivals) {
            console.log(`Found ${data.arrivals.length} arrivals.`);
            data.arrivals.forEach((a: any) => {
                console.log(` - ${a.routeId} @ ${new Date(a.time * 1000).toLocaleTimeString()} to ${a.destination} (${a.minutesUntil} min)`);
            });

            if (data.arrivals.length > 0) {
                console.log('SUCCESS: Inference worked!');
            } else {
                console.warn('FAILURE: No arrivals found. Inference might have failed or no boats active.');
            }
        } else {
            console.error('No arrivals array:', data);
        }

        if (data.debugInfo) {
            console.log('Debug Info:', JSON.stringify(data.debugInfo.metrics, null, 2));
        }

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

testFerry();
