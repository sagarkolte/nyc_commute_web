
import axios from 'axios';
import FormData from 'form-data';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let cachedFeed: any = null;
let lastFetchTime: number = 0;

export class NjtBusService {
    private static async getToken(): Promise<string> {
        if (cachedToken && Date.now() < tokenExpiry) {
            return cachedToken as string;
        }

        const username = process.env.NJT_USERNAME;
        const password = process.env.NJT_PASSWORD;

        if (!username || !password) throw new Error("Missing NJT credentials");

        const form = new FormData();
        form.append('username', username);
        form.append('password', password);

        console.log('Authenticating NJT Bus...');
        const res = await axios.post('https://pcsdata.njtransit.com/api/GTFS/authenticateUser', form, {
            headers: form.getHeaders()
        });

        if (res.data && res.data.UserToken) {
            cachedToken = res.data.UserToken;
            tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 hours cache
            return cachedToken as string;
        } else {
            throw new Error("Failed to get NJT Bus Token");
        }
    }

    private static async getScheduledTime(tripId: string, stopId: string): Promise<number | null> {
        try {
            const filePath = path.join(process.cwd(), 'src', 'lib', 'njt_bus_stop_times.txt');

            const { stdout } = await execAsync(`grep "^${tripId},.*,${stopId}," "${filePath}" | head -n 1`);

            if (!stdout) {
                // console.log(`[NJT Bus] Grep failed/empty for Trip: ${tripId} Stop: ${stopId}`);
                return null;
            }

            // CSV: trip_id,arrival_time,departure_time,stop_id,stop_sequence,...
            const parts = stdout.split(',');
            const arrivalTime = parts[1]; // HH:MM:SS

            if (!arrivalTime) return null;

            // console.log(`[NJT Bus] Grep found time ${arrivalTime} for Trip ${tripId}`);

            const [hours, minutes, seconds] = arrivalTime.split(':').map(Number);
            const now = new Date();
            const scheduledDate = new Date(now);

            // Handle > 24 hours (next day)
            let h = hours;
            if (h >= 24) {
                h -= 24;
                scheduledDate.setDate(scheduledDate.getDate() + 1);
            }

            scheduledDate.setHours(h, minutes, seconds, 0);
            return scheduledDate.getTime() / 1000;
        } catch (e) {
            console.error('Grep error:', e);
            return null;
        }
    }

    public static async getTripUpdates(originId: string, destId?: string) {
        let feed = cachedFeed;

        if (!feed || (Date.now() - lastFetchTime > 60000)) { // 1 min cache
            try {
                const token = await this.getToken();
                const form = new FormData();
                form.append('token', token);

                // Fetch TripUpdates
                const response = await axios.post('https://pcsdata.njtransit.com/api/GTFS/getTripUpdates', form, {
                    headers: form.getHeaders(),
                    responseType: 'arraybuffer'
                });

                feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));
                cachedFeed = feed;
                lastFetchTime = Date.now();
                console.log('[NJT Bus] Fetched fresh feed');
            } catch (e: any) {
                console.error('[NJT Bus] Fetch failed:', e.message);
                if (feed) {
                    console.log('[NJT Bus] Using stale cache');
                } else {
                    throw e;
                }
            }
        } else {
            console.log('[NJT Bus] Using cached feed');
        }

        if (!feed) throw new Error("No NJT data available");
        // console.log(`[NJT Bus] Decoded ${feed.entity.length} entities. Searching for Origin: ${originId}`);

        const relevantTrips = [];
        const now = Date.now() / 1000;

        for (const entity of feed.entity) {
            if (!entity.tripUpdate || !entity.tripUpdate.stopTimeUpdate) continue;

            const updates = entity.tripUpdate.stopTimeUpdate;
            const originUpdate = updates.find((u: any) => u.stopId == originId);

            if (!originUpdate) continue;

            const tripId = entity.tripUpdate.trip.tripId;
            const delay = (originUpdate.arrival?.delay || originUpdate.departure?.delay || 0) as number;

            // Get Time: prefer RT time, else calc from schedule
            let time: any = originUpdate.departure?.time || originUpdate.arrival?.time;

            // Handle Long (protobuf) or 0
            if (time && typeof time === 'object' && 'low' in time) time = time.low;
            if (time === 0) time = null; // Treat 0 as missing

            if (!time) {
                // Fetch scheduled time
                const schedTime = await this.getScheduledTime(tripId as string, originId);
                if (schedTime) {
                    time = schedTime + delay; // Add delay to schedule
                }
            }

            // Allow 60 min past (was 5 min)
            if (!time || (time as any) < now - 3600) continue;

            // If Dest specified...
            let destUpdate = null;
            if (destId) {
                destUpdate = updates.find((u: any) => u.stopId == destId);
                if (!destUpdate) continue;
                if (destUpdate.stopSequence && originUpdate.stopSequence && destUpdate.stopSequence < originUpdate.stopSequence) continue;
            }

            relevantTrips.push({
                tripId: tripId,
                routeId: entity.tripUpdate.trip.routeId,
                time: time,
                destination: destId ? 'Confirmed Destination' : 'Unknown',
                headsign: (entity.tripUpdate.trip as any).tripHeadsign,
                status: delay > 60 ? `Delayed ${Math.round(delay / 60)}m` : (delay < -60 ? `Early ${Math.abs(Math.round(delay / 60))}m` : 'On Time')
            });
        }

        // Sort by time
        relevantTrips.sort((a, b) => (Number(a.time) - Number(b.time)));

        console.log(`[NJT Bus] Found ${relevantTrips.length} relevant trips.`);
        return relevantTrips.slice(0, 5);
    }
}
