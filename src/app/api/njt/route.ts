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
            const targetLines: string[] = destStation.lines || [];

            departures = departures.filter(d => {
                const dDest = d.destination.toLowerCase();

                // 1. Name Match (bidirectional include for robustness)
                if (dDest === targetName || dDest.includes(targetName) || targetName.includes(dDest)) {
                    return true;
                }

                // 2. Line Match (Direct Only)
                if (d.line && targetLines.includes(d.line)) {
                    return true;
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

        let destinationArrivalTime = null;
        if (destStopId && d.stops) {
            const destStop = d.stops.find((s: any) => s.STATION_2CHAR === destStopId);
            if (destStop) {
                // NJT stop time is typically like "01-Jan-2026 06:42:00 PM"
                const parsed = new Date(destStop.TIME);
                if (!isNaN(parsed.getTime())) {
                    destinationArrivalTime = parsed.getTime() / 1000;
                }
            }
        }

        return {
            routeId: d.line, // e.g. "Northeast Corridor"
            time: dTime / 1000,
            destinationArrivalTime: destinationArrivalTime,
            minutesUntil,
            destination: cleanDest,
            track: d.track,
            line: d.line,
            status: d.status
        };
    }).filter(a => a.minutesUntil > -15);

    return NextResponse.json({ arrivals });
}
