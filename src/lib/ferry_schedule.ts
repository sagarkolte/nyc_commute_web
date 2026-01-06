// Static Schedule for NYC Ferry Routes
// Note: This is a representative schedule for proof-of-concept.
// In a production app, this should be generated from the GTFS Static feed.

export interface FerryScheduleItem {
    tripId: string;
    directionId: number; // 0 = Northbound (Wall St -> E 34th), 1 = Southbound (E 34th -> Wall St)
    stops: Record<string, string>; // StopID -> "HH:MM" (24h)
}

export const FERRY_SCHEDULE: Record<string, { Weekday: FerryScheduleItem[], Weekend: FerryScheduleItem[] }> = {
    'East River': {
        Weekday: generateEastRiverWeekday(),
        Weekend: generateEastRiverWeekend()
    }
};

function generateEastRiverWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];

    // Pattern: Starts 6:30 AM, Peaks every 20-30 mins, Off-peak every 45 mins. Ends 9 PM.
    // Simplifying for Hybrid Demo: Hourly + Peak extras

    // Northbound (Wall St -> E 34th)
    // Wall St (87) -> Dumbo (20) -> S Will (8) -> N Will (19) -> Greenpoint (18) -> Hunters Point S (4) -> E 34th (17)
    // Travel time approx: +5, +10, +15, +20, +25, +30 mins

    const startHour = 6;
    const endHour = 21;

    for (let h = startHour; h <= endHour; h++) {
        // :00 Departure
        trips.push(createTrip(h, 0, 0));
        // :30 Departure (Peak hours 7-9, 4-7)
        if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            trips.push(createTrip(h, 30, 0));
        }
    }

    // Southbound (E 34th -> Wall St)
    for (let h = startHour; h <= endHour; h++) {
        // :00 Departure
        trips.push(createTrip(h, 15, 1)); // Offset return trip
        // :45 Departure (Peak hours)
        if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            trips.push(createTrip(h, 45, 1));
        }
    }

    return trips.sort((a, b) => {
        const timeA = Object.values(a.stops)[0];
        const timeB = Object.values(b.stops)[0];
        return timeA.localeCompare(timeB);
    });
}

function generateEastRiverWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    const startHour = 8;
    const endHour = 21;
    // Hourly service on weekends for demo
    for (let h = startHour; h <= endHour; h++) {
        trips.push(createTrip(h, 0, 0));
        trips.push(createTrip(h, 30, 1));
    }
    return trips;
}

// Helpers
function createTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};

    // Definition from ferry_routes.ts
    // North: 87 -> 20 -> 8 -> 19 -> 18 -> 4 -> 17
    const northStops = ['87', '20', '8', '19', '18', '4', '17'];
    // South: 17 -> 4 -> 18 -> 19 -> 8 -> 20 -> 87
    const southStops = [...northStops].reverse();

    const sequence = direction === 0 ? northStops : southStops;
    const timeOffsets = [0, 8, 16, 23, 29, 36, 42]; // Approximate minutes between stops

    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });

    return { tripId, directionId: direction, stops };
}

function formatTime(h: number, m: number): string {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
