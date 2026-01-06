import { NextResponse } from 'next/server';
import { getNjtDepartures, parseNjtDate } from '@/lib/njt';
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
            const targetName = destStation.name.toLowerCase();

            departures = departures.filter(d => {
                const dDest = d.destination.toLowerCase();

                // 1. Check if the train visits the destination stop AFTER the origin station
                if (d.stops && d.stops.length > 0) {
                    const destIdx = d.stops.findIndex((s: any) => s.STATION_2CHAR === destStopId);
                    if (destIdx !== -1) {
                        return true;
                    }
                }

                // 2. Fallback: Name Match (if stops list is missing but destination name matches)
                if (dDest === targetName || dDest.includes(targetName) || targetName.includes(dDest)) {
                    return true;
                }

                // Special case for NY Penn / Newark Penn
                if (targetName.includes('new york') && dDest.includes('new york')) return true;
                if (targetName.includes('newark penn') && dDest.includes('newark penn')) return true;

                return false;
            });
        }
    }

    // Sort by time
    departures.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Map to 'Arrival' interface expected by CountdownCard
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
                const parsed = parseNjtDate(destStop.TIME);
                if (!isNaN(parsed.getTime())) {
                    destinationArrivalTime = parsed.getTime() / 1000;
                }
            }
        }

        return {
            routeId: d.line,
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
