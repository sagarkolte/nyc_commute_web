"use client";

import { useMemo, useState, useEffect } from 'react';
import { Station } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import subwayStations from '@/lib/stations.json';
import lirrStations from '@/lib/lirr_stations.json';
import mnrStations from '@/lib/mnr_stations.json';
import pathStations from '@/lib/path_stations.json';

interface Props {
    mode: 'subway' | 'bus' | 'lirr' | 'mnr' | 'path';
    line: string;
    onSelect: (station: Station, routeId?: string) => void;
    onBack: () => void;
}

export const StationSelector = ({ mode, line, onSelect, onBack }: Props) => {
    const [search, setSearch] = useState('');
    const [busStops, setBusStops] = useState<Station[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [lockedRoute, setLockedRoute] = useState<string | null>(null);

    useEffect(() => {
        setHasKey(!!CommuteStorage.getApiKey());
    }, []);

    useEffect(() => {
        // Only fetch from API if we are NOT locked on a route
        if (mode === 'bus' && !lockedRoute && search.length > 2) {
            const apiKey = CommuteStorage.getApiKey();
            // Server will handle auth if apiKey is missing

            const delayDebounceFn = setTimeout(async () => {
                setLoading(true);
                try {
                    const headers: any = {};
                    if (apiKey) headers['x-mta-api-key'] = apiKey;

                    const res = await fetch(`/api/mta/bus-stops?q=${search}`, {
                        headers
                    });
                    const data = await res.json();
                    if (data.stops) {
                        setBusStops(data.stops);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            }, 1000);

            return () => clearTimeout(delayDebounceFn);
        }
    }, [mode, search, lockedRoute]);

    const handleLock = () => {
        if (search.trim().length > 0) {
            setLockedRoute(search.trim());
            setSearch(''); // Clear search to allow filtering
        }
    };

    const handleUnlock = () => {
        setLockedRoute(null);
        setSearch('');
        setBusStops([]); // Clear stops to restart
    };

    const filtered = useMemo(() => {
        let data: any[] = [];
        if (mode === 'subway') {
            data = subwayStations;
            return (data as Station[])
                .filter(s => s.lines.includes(line))
                .filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else if (mode === 'lirr') {
            data = lirrStations;
            return (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else if (mode === 'mnr') {
            data = mnrStations;
            return (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else if (mode === 'path') {
            data = pathStations;
            return (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else {
            // Bus: 
            if (lockedRoute) {
                // Filter the already-fetched stops by the new search term (stop name)
                return busStops.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            }
            return busStops;
        }
    }, [mode, line, search, busStops, lockedRoute]);

    return (
        <div className="selector">
            <div className="header">
                <button onClick={onBack} className="back-btn">← Back</button>
                <h2>Select {mode === 'lirr' ? 'LIRR Station' : (mode === 'mnr' ? 'Metro-North Station' : (mode === 'path' ? 'PATH Station' : `${line} Station`))}</h2>
            </div>

            {mode === 'bus' && lockedRoute && (
                <div className="locked-header">
                    <span>Route: <strong>{lockedRoute}</strong></span>
                    <button onClick={handleUnlock} className="unlock-btn">Change</button>
                </div>
            )}

            <div className="search-container">
                <input
                    type="text"
                    placeholder={mode === 'bus' ? (lockedRoute ? "Filter stops (e.g. Chelsea)" : "Search Route (e.g. M23)") : "Search station..."}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="search-input"
                    autoFocus
                />
                {mode === 'bus' && !lockedRoute && busStops.length > 0 && (
                    <button onClick={handleLock} className="lock-btn">Lock Route</button>
                )}
            </div>

            <div className="list">
                {mode === 'bus' && !lockedRoute && search.length < 3 && (
                    <div style={{ padding: 16, color: '#888' }}>
                        Enter at least 3 characters of a Route Name (e.g. "M15") to search.
                    </div>
                )}
                {mode === 'bus' && loading && <div style={{ padding: 16 }}>Searching...</div>}


                {filtered.map(s => {
                    // Start of fix for Bus Route selection
                    let bestRoute: string | undefined;
                    if (mode === 'bus' && s.lines) {
                        // Use lockedRoute if available, otherwise search
                        // This ensures we pick the ID matching the Route, not the Stop filter
                        const targetQuery = lockedRoute || search;
                        const cleanSearch = targetQuery.trim().toLowerCase();
                        bestRoute = s.lines.find(l => l.toLowerCase().includes(cleanSearch));
                        if (!bestRoute) bestRoute = s.lines[0];
                    }
                    // End of fix

                    return (
                        <button key={s.id} className="item" onClick={() => onSelect(s as Station, mode === 'bus' ? bestRoute : undefined)}>
                            {mode === 'bus' ? `${s.name} ${s.headsign ? `(${s.headsign})` : `(${s.direction || 'Bus'})`}` : s.name}
                        </button>
                    );
                })}
            </div>

            <style jsx>{`
        .selector { height: 100%; display: flex; flex-direction: column; }
        .header { display: flex; align-items: center; margin-bottom: 16px; }
        .back-btn { background: none; color: var(--primary); font-size: 16px; margin-right: 16px; }
        h2 { margin: 0; font-size: 20px; }
        .search-container { display: flex; gap: 8px; margin-bottom: 16px; }
        .search-input {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: none;
          background: var(--card-bg);
          color: white;
          font-size: 16px;
          flex: 1;
        }
        .lock-btn {
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 0 16px;
            font-weight: bold;
            cursor: pointer;
        }
        .locked-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #333;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
        }
        .unlock-btn {
            background: #555;
            color: white;
            border: none;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .list { flex: 1; overflow-y: auto; }
        .item {
          display: block;
          width: 100%;
          padding: 16px;
          text-align: left;
          background: none;
          border-bottom: 1px solid var(--border);
          color: white;
          font-size: 16px;
        }
      `}</style>
        </div>
    );
};
