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
    },
    'Astoria': {
        Weekday: generateAstoriaWeekday(),
        Weekend: generateAstoriaWeekend()
    },
    'South Brooklyn': {
        Weekday: generateSouthBrooklynWeekday(),
        Weekend: generateSouthBrooklynWeekend()
    },
    'Soundview': {
        Weekday: generateSoundviewWeekday(),
        Weekend: generateSoundviewWeekend()
    },
    'Rockaway': {
        Weekday: generateRockawayWeekday(),
        Weekend: generateRockawayWeekend()
    },
    'St. George': {
        Weekday: generateStGeorgeWeekday(),
        Weekend: generateStGeorgeWeekend()
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

function generateAstoriaWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    const startHour = 6;
    const endHour = 22;

    // Astoria Schedule Pattern (Approximate for Hybrid Demo)
    // Southbound: E 90th -> Wall St (Direction 1)
    // Northbound: Wall St -> E 90th (Direction 0)

    for (let h = startHour; h <= endHour; h++) {
        // :15 Departure from E 90th
        trips.push(createAstoriaTrip(h, 15, 1));

        // Peak Service
        if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            trips.push(createAstoriaTrip(h, 45, 1));
        }
    }

    // Northbound: Wall St -> E 90th (Direction 0)
    for (let h = startHour; h <= endHour; h++) {
        trips.push(createAstoriaTrip(h, 0, 0));
        if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            trips.push(createAstoriaTrip(h, 30, 0));
        }
    }

    return trips.sort((a, b) => {
        const timeA = Object.values(a.stops)[0];
        const timeB = Object.values(b.stops)[0];
        return timeA.localeCompare(timeB);
    });
}

function generateAstoriaWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    const startHour = 8;
    const endHour = 22;
    for (let h = startHour; h <= endHour; h++) {
        trips.push(createAstoriaTrip(h, 15, 1));
        trips.push(createAstoriaTrip(h, 0, 0));
    }
    return trips;
}

function createAstoriaTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_AST_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};

    // North: Wall St (87) -> Navy Yard (120) -> E 34th (17) -> LIC (90) -> Roosevelt (25) -> Astoria (89) -> E 90th (113)
    const northStops = ['87', '120', '17', '90', '25', '89', '113'];
    // South: Reverse
    const southStops = [...northStops].reverse();

    const sequence = direction === 0 ? northStops : southStops;
    // Offsets: 0, 10, 20, 25, 30, 35, 40
    const timeOffsets = [0, 10, 20, 25, 30, 35, 40];

    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });

    return { tripId, directionId: direction, stops };
}

// --- SOUTH BROOKLYN ---
function generateSouthBrooklynWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    const startHour = 6;
    const endHour = 20; // 8 PM
    for (let h = startHour; h <= endHour; h++) {
        trips.push(createSouthBrooklynTrip(h, 15, 1)); // South
        trips.push(createSouthBrooklynTrip(h, 45, 0)); // North
    }
    return sortTrips(trips);
}
function generateSouthBrooklynWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 8; h <= 21; h++) {
        trips.push(createSouthBrooklynTrip(h, 0, 1));
        trips.push(createSouthBrooklynTrip(h, 30, 0));
    }
    return sortTrips(trips);
}
function createSouthBrooklynTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_SB_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};
    // SB: Corlears (115) -> Dumbo (20) -> Wall St (87) -> Pier 6 (11) -> Red Hook (24) -> Sunset Park (118) -> Bay Ridge (23)
    const southStops = ['115', '20', '87', '11', '24', '118', '23'];
    const northStops = [...southStops].reverse();
    const sequence = direction === 1 ? southStops : northStops;
    // Approx run time ~50 mins
    const timeOffsets = [0, 8, 15, 23, 31, 40, 48];
    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });
    return { tripId, directionId: direction, stops };
}

// --- SOUNDVIEW ---
function generateSoundviewWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 6; h <= 20; h++) { // 6 AM - 8 PM
        trips.push(createSoundviewTrip(h, 10, 1)); // South
        trips.push(createSoundviewTrip(h, 40, 0)); // North
    }
    return sortTrips(trips);
}
function generateSoundviewWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 8; h <= 21; h++) {
        trips.push(createSoundviewTrip(h, 15, 1));
        trips.push(createSoundviewTrip(h, 45, 0));
    }
    return sortTrips(trips);
}
function createSoundviewTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_SV_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};
    // SV: Ferry Pt (141) -> Soundview (112) -> E 90th (113) -> Stuy Cove (114) -> E 34th (17) -> Wall St (87)
    const southStops = ['141', '112', '113', '114', '17', '87'];
    const northStops = [...southStops].reverse();
    const sequence = direction === 1 ? southStops : northStops;
    const timeOffsets = [0, 10, 20, 30, 35, 45];
    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });
    return { tripId, directionId: direction, stops };
}

// --- ROCKAWAY ---
function generateRockawayWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 6; h <= 20; h++) {
        trips.push(createRockawayTrip(h, 15, 0)); // Towards Wall St
        trips.push(createRockawayTrip(h, 15, 1)); // Towards Rockaway
    }
    return sortTrips(trips);
}
function generateRockawayWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 7; h <= 21; h++) {
        trips.push(createRockawayTrip(h, 30, 0));
        trips.push(createRockawayTrip(h, 30, 1));
    }
    return sortTrips(trips);
}
function createRockawayTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_RW_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};
    // RW: Rockaway (88) -> Sunset Park (118) -> Wall St (87)
    // Direction 0: To Wall St
    const toWallSt = ['88', '118', '87'];
    const toRockaway = [...toWallSt].reverse();
    const sequence = direction === 0 ? toWallSt : toRockaway;
    // Fast ferry ~55 mins
    const timeOffsets = [0, 40, 55];
    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });
    return { tripId, directionId: direction, stops };
}

// --- ST GEORGE ---
function generateStGeorgeWeekday(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 6; h <= 20; h++) {
        trips.push(createStGeorgeTrip(h, 20, 0)); // To Midtown
        trips.push(createStGeorgeTrip(h, 50, 1)); // To St George
    }
    return sortTrips(trips);
}
function generateStGeorgeWeekend(): FerryScheduleItem[] {
    const trips: FerryScheduleItem[] = [];
    for (let h = 8; h <= 21; h++) {
        trips.push(createStGeorgeTrip(h, 0, 0));
        trips.push(createStGeorgeTrip(h, 30, 1));
    }
    return sortTrips(trips);
}
function createStGeorgeTrip(hour: number, minute: number, direction: number): FerryScheduleItem {
    const tripId = `SCH_SG_${Math.random().toString(36).substr(2, 5)}`;
    const stops: Record<string, string> = {};
    // SG: St George (137) -> Battery Park City (136) -> Midtown West (138)
    const toMidtown = ['137', '136', '138'];
    const toStGeorge = [...toMidtown].reverse();
    const sequence = direction === 0 ? toMidtown : toStGeorge;
    // Approx 35 mins
    const timeOffsets = [0, 18, 35];
    sequence.forEach((stopId, idx) => {
        const totalMin = minute + timeOffsets[idx];
        const h = hour + Math.floor(totalMin / 60);
        const m = totalMin % 60;
        stops[stopId] = formatTime(h, m);
    });
    return { tripId, directionId: direction, stops };
}

// Shared Sorter
function sortTrips(trips: FerryScheduleItem[]): FerryScheduleItem[] {
    return trips.sort((a, b) => {
        const timeA = Object.values(a.stops)[0] || '00:00';
        const timeB = Object.values(b.stops)[0] || '00:00';
        return timeA.localeCompare(timeB);
    });
}
