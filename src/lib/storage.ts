import { CommuteTuple } from "@/types";

const STORAGE_KEY = 'nyc_commute_tuples';

export const CommuteStorage = {
    getTuples: (): CommuteTuple[] => {
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    addTuple: (tuple: CommuteTuple) => {
        const tuples = CommuteStorage.getTuples();
        tuples.push(tuple);
        CommuteStorage.saveTuples(tuples);
    },

    saveTuples: (tuples: CommuteTuple[]) => {
        if (typeof window === 'undefined') return;

        // Hydrate coordinates for Native Sorting
        // Native AppDelegate doesn't have the station database, so we must bake coords into the JSON.
        // We import dynamically to avoid potential circular dep issues during init, although statically might work.
        // Actually, let's try synchronous logic if possible? 
        // We can't use 'import' inside sync function easily without promise.
        // Let's assume we can lazily load or imports are fine.
        // But saveTuples is sync? No, it returns void.

        // ISSUE: getStationCoordinates is in 'location.ts'. 
        // We should move saveTuples logic to be async OR assume hydration happened elsewhere.
        // BUT we need to guarantee it for Native.
        // Let's use the dynamic import pattern but properly.

        // Actually, we can just do a best-effort sync save for localStorage, 
        // AND an async hydration for the Widget bridge/JSON.

        // Step 1: Save to LocalStorage immediately (UI speed)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tuples));

        // Step 2: Hydrate & Sync to Native
        import('./location').then(({ getStationCoordinates }) => {
            const hydrated = tuples.map(t => {
                if (t.lat && t.lon) return t;
                const coords = getStationCoordinates(t.mode, t.stopId || '');
                if (coords) {
                    return { ...t, lat: coords.lat, lon: coords.lon };
                }
                return t;
            });

            // Re-save to LocalStorage with coords? 
            // Better to keep localStorage clean? No, keeping coords is good cache.
            localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));

            console.log("🟦 [JS] CommuteStorage.saveTuples called. Attempting Widget Sync...");

            // Sync to Native Widget
            import('./widget_bridge').then(async m => {
                console.log("🟦 [JS] Calling updateData with Hydrated Tuples...");
                m.default.updateData({ json: JSON.stringify(hydrated) })
                    .then(() => console.log("🟦 [JS] UpdateData resolved successfully"))
                    .catch(e => console.error("🟥 [JS] UpdateData rejected:", e));
                m.default.reloadTimeline();
            }).catch(err => console.error("🟥 [JS] Widget Bridge Import Error:", err));

        });
    },

    removeTuple: (id: string) => {
        const tuples = CommuteStorage.getTuples();
        const filtered = tuples.filter(t => t.id !== id);
        CommuteStorage.saveTuples(filtered); // Use saveTuples to sync
    },

    updateTuple: (id: string, updates: Partial<CommuteTuple>) => {
        const tuples = CommuteStorage.getTuples();
        const index = tuples.findIndex(t => t.id === id);
        if (index !== -1) {
            tuples[index] = { ...tuples[index], ...updates };
            CommuteStorage.saveTuples(tuples);
        }
    },

    getApiKey: (): string | null => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('mta-api-key') || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY || null;
    },

    setApiKey: (key: string) => {
        localStorage.setItem('mta-api-key', key);
    },

    // Runtime Cache for Widget ETAs and Location
    _widgetCache: {} as Record<string, string[]>,
    _debounceTimer: null as any,
    _lastLocation: null as { lat: number, lon: number } | null,

    updateLocation: (lat: number, lon: number) => {
        CommuteStorage._lastLocation = { lat, lon };
    },

    updateTupleETAs: (id: string, etas: string[]) => {
        if (typeof window === 'undefined') return;

        // Update the runtime cache immediately
        CommuteStorage._widgetCache[id] = etas;
        console.log(`🟦 [JS] Cached ETAs for ${id}:`, etas);

        // Clear existing timer (Debounce)
        if (CommuteStorage._debounceTimer) {
            clearTimeout(CommuteStorage._debounceTimer);
        }

        // Set pending write
        CommuteStorage._debounceTimer = setTimeout(() => {
            console.log("🟦 [JS] Debounce timer fired. Syncing Widget Data...");

            // Construct Payload for Native Merge (Just IDs and ETAs)
            const updates = Object.entries(CommuteStorage._widgetCache).map(([id, etas]) => ({
                id,
                etas
            }));

            // Send to Native (using updateEtas to preserve Native Sort Order)
            import('./widget_bridge').then(m => {
                m.default.updateEtas({ json: JSON.stringify(updates) })
                    .then(() => console.log("🟦 [JS] Widget ETA Sync Success (Merge)"))
                    .catch(e => console.error("🟥 [JS] Widget ETA Sync Failed:", e));

                // Always reload timeline to reflect new times
                m.default.reloadTimeline();
            }).catch(err => console.error("🟥 [JS] Import Error:", err));

            CommuteStorage._debounceTimer = null;
        }, 2000); // 2 second debounce (Wait for all cards to finish fetching)
    },
    // Auto-Sort Preference
    getAutoSort: (): boolean => {
        if (typeof window === 'undefined') return true; // Default to true if SSR
        const val = localStorage.getItem('auto-sort');
        if (val === null) return true; // Default to true if not set
        return val === 'true';
    },

    setAutoSort: (enabled: boolean) => {
        localStorage.setItem('auto-sort', String(enabled));
    }
};
