import { NextResponse } from 'next/server';
import { getNjtDepartures } from '@/lib/njt';
import njtStations from '@/lib/njt_stations.json';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const station = searchParams.get('station'); // This is actually stopId or station code
    const destStopId = searchParams.get('destStopId'); // destination station code

    // If 'station' is missing (which is mapped from routeId/stopId keys in client), check 'stopId'
    const actualStation = station || searchParams.get('stopId');

    if (!actualStation) {
        return NextResponse.json({ error: 'Station required' }, { status: 400 });
    }

    let departures = await getNjtDepartures(actualStation);

    if (destStopId) {
        const destStation = (njtStations as any[]).find(s => s.id === destStopId);
        if (destStation) {
            // Filter by destination name AND/OR Line
            const targetName = destStation.name.toLowerCase();
            const targetLines = destStation.lines || [];

            // Transfer Rules: Allow main line trains for branch destinations
            // e.g. Raritan Valley (requires transfer at Newark) -> Allow NEC/NJCL trains
            const TRANSFER_RULES: Record<string, string[]> = {
                'Raritan Valley': ['Northeast Corrdr', 'No Jersey Coast'],
                'Gladstone Branch': ['Morristown Line', 'Morris & Essex Line'],
                'Montclair-Boonton': ['Morristown Line', 'Morris & Essex Line', 'Northeast Corrdr'] // Connecting at Newark/Secaucus
            };

            departures = departures.filter(d => {
                const dDest = d.destination.toLowerCase();

                // 0. Destination Name Match (Direct)
                if (dDest === targetName || dDest.includes(targetName) || targetName.includes(dDest)) {
                    return true;
                }

                if (d.line) {
                    // 1. Line Match (Direct)
                    if (targetLines.includes(d.line)) return true;

                    // 2. Transfer Match
                    // Check if any of the target station's lines are served by this train's line via transfer
                    const isTransfer = targetLines.some((tl: string) => {
                        const allowed = TRANSFER_RULES[tl];
                        return allowed && allowed.includes(d.line);
                    });
                    if (isTransfer) return true;
                }

                return false;
            });
        }
    }

    // Sort by time
    departures.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Map to 'Arrival' interface expected by CountdownCard
    // Arrival: { routeId, time, minutesUntil, destination, track }
    const now = Date.now();
    const arrivals = departures.map(d => {
        const dTime = new Date(d.time).getTime();
        const diffMs = dTime - now;
        const minutesUntil = Math.floor(diffMs / 60000);

        let cleanDest = d.destination
            .replace(/-SEC/g, '')
            .replace(/&#9992/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();

        return {
            routeId: d.line, // e.g. "Northeast Corridor"
            time: dTime / 1000,
            minutesUntil,
            destination: cleanDest,
            track: d.track,
            line: d.line,
            status: d.status
        };
    }).filter(a => a.minutesUntil > -15);

    return NextResponse.json({ arrivals });
}
