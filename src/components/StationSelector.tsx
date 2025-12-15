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
    onSelect: (station: Station, routeId?: string, destStation?: Station) => void;
    onBack: () => void;
}

export const StationSelector = ({ mode, line, onSelect, onBack }: Props) => {
    const [search, setSearch] = useState('');
    const [busStops, setBusStops] = useState<Station[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [lockedRoute, setLockedRoute] = useState<string | null>(null);
    const [originStation, setOriginStation] = useState<Station | null>(null);

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

    const handleUnlock = () => {
        setLockedRoute(null);
        setSearch(''); // Clear search to allow finding new route
        setBusStops([]); // Clear stops to restart
    };

    const handleMNRReset = () => {
        setOriginStation(null);
        setSearch('');
    };

    const uniqueRoutes = useMemo(() => {
        if (mode !== 'bus' || lockedRoute) return [];
        // Extract unique routes from fetched stops
        const routesMap = new Map<string, number>();
        busStops.forEach(s => {
            s.lines.forEach(id => {
                // Only include the route matching the search query closely?
                // Or just show all? The API "search-for-route" usually returns relevant stops.
                // We show all lines associated with these stops.
                // But we should prioritize the one matching the query.
                // Filter: Only show matches to query?
                if (!id) return;
                const count = routesMap.get(id) || 0;
                routesMap.set(id, count + 1);
            });
        });

        // Convert to array and sort by relevance (exact match first, then length)
        return Array.from(routesMap.entries())
            .map(([id, count]) => ({ id, count }))
            .filter(r => r.id.toLowerCase().includes(search.toLowerCase().trim())) // Only show relevant routes
            .sort((a, b) => {
                const q = search.toLowerCase().trim();
                const aName = a.id.toLowerCase();
                const bName = b.id.toLowerCase();
                if (aName === q) return -1;
                if (bName === q) return 1;
                return aName.length - bName.length;
            });
    }, [busStops, lockedRoute, search, mode]);

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
            const res = (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            if (originStation) {
                return res.filter(s => s.id !== originStation.id);
            }
            return res;
        } else if (mode === 'path') {
            data = pathStations;
            return (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else {
            // Bus: 
            if (lockedRoute) {
                // Filter by route AND (name OR headsign OR direction)
                const q = search.toLowerCase().trim();
                return busStops
                    .filter(s => s.lines.includes(lockedRoute))
                    .filter(s => {
                        const nameMatch = s.name.toLowerCase().includes(q);
                        const headsignMatch = s.headsign?.toLowerCase().includes(q);
                        const directionMatch = s.direction?.toLowerCase().includes(q);
                        return nameMatch || headsignMatch || directionMatch;
                    });
            }
            return []; // When not locked, we use uniqueRoutes instead
        }
    }, [mode, line, search, busStops, lockedRoute, originStation]);

    const handleSelect = (s: Station, routeId?: string) => {
        if (mode === 'mnr') {
            if (!originStation) {
                setOriginStation(s);
                setSearch('');
            } else {
                onSelect(originStation, undefined, s);
            }
        } else {
            onSelect(s, routeId);
        }
    };

    const getTitle = () => {
        if (mode === 'mnr') {
            return originStation ? 'Select Arrival Station' : 'Select Departure Station';
        }
        return mode === 'lirr' ? 'LIRR Station' : (mode === 'path' ? 'PATH Station' : `${line} Station`);
    };

    const getPlaceholder = () => {
        if (mode === 'bus') {
            return lockedRoute ? "Filter by Name/Dest..." : "Search Route (e.g. M23)";
        }
        if (mode === 'mnr' && originStation) {
            return "Select Arrival Station...";
        }
        return "Search station...";
    };

    return (
        <div className="selector">
            <div className="header">
                <button onClick={onBack} className="back-btn">← Back</button>
                <h2>{getTitle()}</h2>
            </div>

            {mode === 'mnr' && originStation && (
                <div className="locked-header">
                    <span>From: <strong>{originStation.name}</strong></span>
                    <button onClick={handleMNRReset} className="unlock-btn">Change</button>
                </div>
            )}

            {mode === 'bus' && lockedRoute && (
                <div className="locked-header">
                    <span>Route: <strong>{lockedRoute.replace('MTA NYCT_', '').replace('+', '')}</strong></span>
                    <button onClick={handleUnlock} className="unlock-btn">Change</button>
                </div>
            )}

            <div className="search-container">
                <input
                    type="text"
                    placeholder={getPlaceholder()}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="search-input"
                    autoFocus
                />
            </div>

            <div className="list">
                {mode === 'bus' && !lockedRoute ? (
                    <>
                        {search.length < 3 && (
                            <div style={{ padding: 16, color: '#888' }}>
                                Enter Route Name (e.g. "M23")
                            </div>
                        )}
                        {loading && <div style={{ padding: 16 }}>Searching Routes...</div>}
                        {uniqueRoutes.map(route => (
                            <button
                                key={route.id}
                                className="item icon-item"
                                onClick={() => {
                                    setLockedRoute(route.id);
                                    setSearch('');
                                }}
                            >
                                <span className="route-icon">{route.id.replace('MTA NYCT_', '').replace('+', '')}</span>
                                <span className="route-count">{route.count} stops</span>
                            </button>
                        ))}
                    </>
                ) : (
                    filtered.map(s => {
                        let bestRoute: string | undefined;
                        if (mode === 'bus' && s.lines) {
                            const targetQuery = lockedRoute || search;
                            const cleanSearch = targetQuery.trim().toLowerCase();
                            bestRoute = s.lines.find(l => l.toLowerCase().includes(cleanSearch));
                            if (!bestRoute) bestRoute = s.lines[0];
                        }

                        return (
                            <button key={s.id} className="item" onClick={() => handleSelect(s as Station, mode === 'bus' ? bestRoute : undefined)}>
                                {mode === 'bus' ? `${s.name} ${s.headsign ? `(${s.headsign})` : `(${s.direction || 'Bus'})`}` : s.name}
                            </button>
                        );
                    })
                )}
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
        .route-icon {
            background: #444;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            margin-right: 12px;
        }
        .route-count {
            color: #888;
            font-size: 14px;
        }
        .icon-item {
            display: flex;
            align-items: center;
        }
        .list { flex: 1; overflow-y: auto; }
        .item {
          display: block;
          width: 100%;
          padding: 16px;
          text-align: left;
          background: none;
          border: none;
          border-bottom: 1px solid var(--border);
          color: white;
          font-size: 16px;
          cursor: pointer;
        }
        .item:hover { background: #222; }
      `}</style>
        </div>
    );
};
