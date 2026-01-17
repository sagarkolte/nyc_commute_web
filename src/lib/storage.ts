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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tuples));

        console.log("🟦 [JS] CommuteStorage.saveTuples called. Attempting Widget Sync...");

        // Sync to Native Widget (Best Effort)
        try {
            import('./widget_bridge').then(async m => {
                console.log("🟦 [JS] Loaded widget_bridge. Plugins Available:", Object.keys((window as any).Capacitor?.Plugins || {}));
                console.log("🟦 [JS] Testing Echo...");
                try {
                    await m.default.echo({ value: 'Hello Native!' });
                    console.log("🟩 [JS] Echo Success!");
                } catch (e) {
                    console.error("🟥 [JS] Echo Failed:", e);
                }

                console.log("🟦 [JS] Calling updateData...");
                m.default.updateData({ json: JSON.stringify(tuples) })
                    .then(() => console.log("🟦 [JS] UpdateData resolved successfully"))
                    .catch(e => console.error("🟥 [JS] UpdateData rejected:", e));

                m.default.reloadTimeline();
            }).catch(err => console.error("🟥 [JS] Widget Bridge Import Error:", err));
        } catch (e) {
            console.warn("🟥 [JS] Failed to sync widget", e);
        }
    },

    removeTuple: (id: string) => {
        const tuples = CommuteStorage.getTuples();
        const filtered = tuples.filter(t => t.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    },

    getApiKey: (): string | null => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('mta-api-key') || process.env.NEXT_PUBLIC_MTA_BUS_API_KEY || null;
    },

    setApiKey: (key: string) => {
        localStorage.setItem('mta-api-key', key);
    },

    // Runtime Cache for Widget ETAs (not persisted in localStorage, just memory)
    _widgetCache: {} as Record<string, string[]>,

    updateTupleETAs: (id: string, etas: string[]) => {
        if (typeof window === 'undefined') return;

        // Update the runtime cache
        CommuteStorage._widgetCache[id] = etas;

        // Get the static configuration
        const tuples = CommuteStorage.getTuples();

        // Merge Config + Realtime Data
        const widgetData = tuples.map(t => ({
            ...t,
            etas: CommuteStorage._widgetCache[t.id] || []
        }));

        console.log(`🟦 [JS] Syncing Widget Data with ETAs for ${id}:`, etas);

        // Send to Native
        import('./widget_bridge').then(m => {
            m.default.updateData({ json: JSON.stringify(widgetData) })
                .catch(e => console.error("🟥 [JS] Widget Sync Failed:", e));

            // Only reload timeline if we actually have data (throttling could be added here)
            m.default.reloadTimeline();
        });
    }
};
