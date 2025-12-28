export type CommuteMode = 'subway' | 'bus' | 'rail' | 'njt-bus' | 'njt-rail' | 'njt';
export type CommuteDirection = 'N' | 'S' | 'E' | 'W' | string;

export interface CommuteTuple {
    id: string; // UUID
    label: string; // e.g. "Work to Home"
    mode: CommuteMode;
    routeId: string; // e.g. "L", "4", "A"
    stopId: string; // GTFS User-facing stop ID
    direction: CommuteDirection; // Inferred from GTFS data or user selection
    destinationName?: string; // Explicit terminal station name (e.g. "Chelsea Piers")
    destinationStopId?: string; // For Rail (MNR/LIRR) Start-End filtering
    createdAt: number;
}

export interface Arrival {
    routeId: string;
    time: number; // unix timestamp
    minutesUntil: number;
    destination?: string;
    track?: string;
}

export interface Station {
    id: string;
    name: string;
    lines: string[];
    north_label: string;
    south_label: string;
    // Bus support
    direction?: string;
    lat?: number;
    lon?: number;
    headsign?: string; // Terminal station name for Buses
    njt_destination?: string; // NJT Bus Terminal Name
}
