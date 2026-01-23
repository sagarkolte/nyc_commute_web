
import { NextResponse } from 'next/server';
import siSchedule from '@/lib/si_ferry_schedule.json';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stopId'); // 'whitehall' or 'st-george'

    if (!stopId) {
        return NextResponse.json({ error: 'Missing stopId' }, { status: 400 });
    }

    const now = new Date();
    // Convert to NYC time if server is different (simplified for now as local)
    const day = now.getDay(); // 0: Sunday, 6: Saturday
    const isWeekend = day === 0 || day === 6;

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    const arrivals: any[] = [];

    const patterns = isWeekend ? siSchedule.patterns.weekend : siSchedule.patterns.weekday;

    // Find the current or upcoming pattern
    // For SI Ferry, frequencies are usually aligned to the hour (e.g. at :00, :15, :30, :45)

    function getNextTimes(startTimeMin: number, freq: number, count: number) {
        const times: number[] = [];
        // Round up current time to next frequency interval
        let next = Math.ceil(currentTimeInMinutes / freq) * freq;
        if (next === currentTimeInMinutes) next += freq; // ensure we show future ferries

        for (let i = 0; i < count; i++) {
            times.push(next + (i * freq));
        }
        return times;
    }

    let frequency = 30;
    if (isWeekend) {
        frequency = siSchedule.patterns.weekend.all_day.frequency;
    } else {
        const p = siSchedule.patterns.weekday;
        if (currentTimeInMinutes >= 6 * 60 && currentTimeInMinutes < 9.5 * 60) {
            frequency = p.peak.frequency;
        } else if (currentTimeInMinutes >= 9.5 * 60 && currentTimeInMinutes < 15.5 * 60) {
            frequency = p.midday.frequency;
        } else if (currentTimeInMinutes >= 15.5 * 60 && currentTimeInMinutes < 20 * 60) {
            frequency = p.evening_peak.frequency;
        } else {
            frequency = p.night.frequency;
        }
    }

    const nextMinutes = getNextTimes(currentTimeInMinutes, frequency, 3);

    nextMinutes.forEach(m => {
        const arrivalDate = new Date(now);
        arrivalDate.setHours(Math.floor(m / 60), m % 60, 0, 0);

        // If it wrapped to next day
        if (arrivalDate.getTime() < now.getTime()) {
            arrivalDate.setDate(arrivalDate.getDate() + 1);
        }

        const arrivalTime = arrivalDate.getTime() / 1000;

        arrivals.push({
            routeId: 'SI_FERRY',
            time: arrivalTime,
            minutesUntil: Math.floor((arrivalTime - (now.getTime() / 1000)) / 60),
            destination: stopId === 'whitehall' ? 'St. George' : 'Manhattan',
            isStatic: true
        });
    });

    return NextResponse.json({ arrivals });
}
