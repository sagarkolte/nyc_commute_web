
import scheduleData from './si_ferry_schedule.json';

export interface SiFerryDeparture {
    time: Date;
    minutesUntil: number;
}

export function getNextSiFerryDepartures(stopId: string, limit: number = 3): SiFerryDeparture[] {
    const now = new Date();
    // Convert current time to "HH:MM" for comparison
    // Note: This naive implementation assumes local time matches NYC time roughly, 
    // or that the server is in UTC. Ideally we use timezone aware logic.
    // For Vercel/Serverless, we should force NYC time.

    const validDepartures: Date[] = [];
    const checkDate = new Date(now);

    // Check for next 24 hours to be safe
    // We will generate potential slots for today and tomorrow and filter
    for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + dayOffset);

        const dayOfWeek = targetDate.getDay(); // 0 = Sun, 6 = Sat
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const scheduleType = isWeekend ? 'weekend' : 'weekday';
        const patterns = scheduleData.patterns[scheduleType as keyof typeof scheduleData.patterns];

        // Flatten patterns into a list of rules
        // e.g. [{start: "06:00", end: "09:30", freq: 15}, ...]
        const rules = Object.values(patterns);

        rules.forEach((rule: any) => {
            const [startH, startM] = rule.start.split(':').map(Number);
            const [endH, endM] = rule.end.split(':').map(Number);

            let currentH = startH;
            let currentM = startM;

            // Loop until we hit end time
            while (currentH < endH || (currentH === endH && currentM < endM)) {

                // Construct Date object for this departure
                const departure = new Date(targetDate);
                departure.setHours(currentH, currentM, 0, 0);

                if (departure > now) {
                    validDepartures.push(departure);
                }

                // Increment
                currentM += rule.frequency;
                while (currentM >= 60) {
                    currentM -= 60;
                    currentH += 1;
                }
            }
        });
    }

    // Sort and take top N
    validDepartures.sort((a, b) => a.getTime() - b.getTime());

    return validDepartures.slice(0, limit).map(d => ({
        time: d,
        minutesUntil: Math.floor((d.getTime() - now.getTime()) / 60000)
    }));
}
