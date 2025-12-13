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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tuples));
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
    }
};
