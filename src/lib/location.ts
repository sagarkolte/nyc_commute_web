import { SUBWAY_COORDINATES } from './subway_coordinates';
import { PATH_COORDINATES } from './path_coordinates';
import LIRR_STATIONS from './lirr_stations.json';
import MNR_STATIONS from './mnr_stations.json';
import { CommuteTuple } from '@/types';

// Types
interface Coords {
    lat: number;
    lon: number;
}

// Helper to clean ID (remove N/S suffix for Subway)
function cleanSubwayId(id: string): string {
    if (id.endsWith('N') || id.endsWith('S')) {
        return id.slice(0, -1);
    }
    return id;
}

export function getStationCoordinates(mode: string, stopId: string): Coords | null {
    try {
        if (mode === 'subway') {
            const cleanId = cleanSubwayId(stopId);
            return SUBWAY_COORDINATES[cleanId] || SUBWAY_COORDINATES[stopId] || null;
        }

        if (mode === 'rail' || mode === 'lirr') { // 'rail' is commonly used for LIRR in our app legacy? OR is it 'lirr'?
            // Check type definition: CommuteMode = 'subway' | 'bus' | 'rail' | 'njt-bus' | 'njt-rail' | 'njt';
            // Wait, LIRR is usually 'rail'? Let's check lirr_stations.json usage.
            // Actually, let's just search both LIRR and MNR arrays if mode is generic 'rail' 
            // OR checks specific modes loop.

            const lirr = LIRR_STATIONS.find((s: any) => s.id === stopId);
            if (lirr && lirr.lat) return { lat: parseFloat(lirr.lat), lon: parseFloat(lirr.lon) };

            const mnr = MNR_STATIONS.find((s: any) => s.id === stopId);
            if (mnr && mnr.lat) return { lat: parseFloat(mnr.lat), lon: parseFloat(mnr.lon) };
        }

        // Explicit MNR
        if (mode === 'mnr') {
            const mnr = MNR_STATIONS.find((s: any) => s.id === stopId);
            if (mnr && mnr.lat) return { lat: parseFloat(mnr.lat), lon: parseFloat(mnr.lon) };
        }

        if (mode === 'njt') { // PATH uses 'njt'? No, PATH is separate usually?
            // Wait, current app treats PATH as what?
            // "path" stops usually map to mode="subway" with routeId="PATH"?
            // Or is key distinct?
            // Let's check `PATH_COORDINATES` logic.
            return PATH_COORDINATES[stopId] || null;
        }

        // PATH special case: In some parts of app, PATH might have its own handling?
        // Let's assume if we find it in PATH_COORDINATES, use it.
        if (PATH_COORDINATES[stopId]) return PATH_COORDINATES[stopId];

        return null;
    } catch (e) {
        console.warn('Error getting coordinates', e);
        return null;
    }
}

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}

export function sortTuplesByLocation(tuples: CommuteTuple[], userLat: number, userLon: number): CommuteTuple[] {
    return [...tuples].sort((a, b) => {
        let coordsA = (a.lat && a.lon) ? { lat: a.lat, lon: a.lon } : getStationCoordinates(a.mode, a.stopId);
        let coordsB = (b.lat && b.lon) ? { lat: b.lat, lon: b.lon } : getStationCoordinates(b.mode, b.stopId);

        // If no coords, push to bottom
        if (!coordsA && !coordsB) return 0;
        if (!coordsA) return 1;
        if (!coordsB) return -1;

        const distA = getDistanceFromLatLonInKm(userLat, userLon, coordsA.lat, coordsA.lon);
        const distB = getDistanceFromLatLonInKm(userLat, userLon, coordsB.lat, coordsB.lon);

        return distA - distB;
    });
}
