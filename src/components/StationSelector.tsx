"use client";

import { useMemo, useState, useEffect } from 'react';
import { Station } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import subwayStations from '@/lib/stations.json';
import lirrStations from '@/lib/lirr_stations.json';
import mnrStations from '@/lib/mnr_stations.json';
import pathStations from '@/lib/path_stations.json';
import njtStations from '@/lib/njt_stations.json';

interface StationSelectorProps {
    mode: 'subway' | 'bus' | 'lirr' | 'mnr' | 'path' | 'njt' | 'njt-bus' | 'njt-rail';

    line?: string; // Made optional as it's not always used
    onSelect: (station: Station, routeId?: string, destStation?: Station) => void;
    onBack?: () => void; // Made optional
    placeholder?: string; // New prop
    routeFilter?: string | null; // New prop
}

export const StationSelector = ({ mode, line, onSelect, onBack, placeholder, routeFilter }: StationSelectorProps) => {
    const [search, setSearch] = useState('');
    const [busStops, setBusStops] = useState<Station[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [lockedRoute, setLockedRoute] = useState<string | null>(null);
    const [originStation, setOriginStation] = useState<Station | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [njtRoutes, setNjtRoutes] = useState<any[]>([]);
    const [njtDirections, setNjtDirections] = useState<string[]>([]);
    const [njtStops, setNjtStops] = useState<any[]>([]);
    const [njtStep, setNjtStep] = useState<'route' | 'direction' | 'stop'>('route');
    const [selectedNjtRoute, setSelectedNjtRoute] = useState<string | null>(null);
    const [selectedNjtDirection, setSelectedNjtDirection] = useState<string | null>(null);

    useEffect(() => {
        setHasKey(!!CommuteStorage.getApiKey());
    }, []);

    useEffect(() => {
        // NJ Transit Bus V2 Initial Load: Routes
        if (mode === 'njt-bus' && njtStep === 'route' && njtRoutes.length === 0) {
            const fetchNjtRoutes = async () => {
                setLoading(true);
                try {
                    // We'll call our api to proxy the request
                    const res = await fetch('/api/njt-bus/routes');
                    const data = await res.json();
                    setNjtRoutes(data || []);
                } catch (e) {
                    console.error('Failed to fetch NJT routes', e);
                } finally {
                    setLoading(false);
                }
            };
            fetchNjtRoutes();
        }
    }, [mode, njtStep, njtRoutes.length]);

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

    const handleReset = () => {
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
                .filter(s => line ? s.lines.includes(line) : true)
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
        } else if (mode === 'njt' || mode === 'njt-rail') {
            data = njtStations;
            const res = (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            if (originStation) {
                return res.filter(s => s.id !== originStation.id);
            }
            return res;

            return res;
        } else if (mode === 'njt-bus') {
            if (njtStep === 'route') {
                return (njtRoutes || []).filter(r =>
                    (r.BusRouteID || '').toLowerCase().includes(search.toLowerCase()) ||
                    (r.BusRouteDescription || '').toLowerCase().includes(search.toLowerCase())
                );
            } else if (njtStep === 'direction') {
                return (njtDirections || []).filter(d => (d || '').toLowerCase().includes(search.toLowerCase()));
            } else if (njtStep === 'stop') {
                return (njtStops || []).filter(s => (s.busstopdescription || '').toLowerCase().includes(search.toLowerCase()));
            }
            return [];
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

    const handleSelect = async (s: any, routeId?: string) => {
        if (mode === 'njt-bus') {
            if (njtStep === 'route') {
                const targetRouteId = s.BusRouteID;
                setSelectedNjtRoute(targetRouteId);
                setSearch('');
                setLoading(true);
                try {
                    const res = await fetch(`/api/njt-bus/directions?route=${encodeURIComponent(targetRouteId)}`);
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    setNjtDirections(Array.isArray(data) ? data : []);
                    setNjtStep('direction');
                } catch (e: any) {
                    console.error('Failed to fetch directions:', e);
                    setError(e.message);
                } finally {
                    setLoading(false);
                }
            } else if (njtStep === 'direction') {
                const targetDir = s;
                setSelectedNjtDirection(targetDir);
                setSearch('');
                setLoading(true);
                try {
                    // Use targetRouteId from local variable if we want, but selectedNjtRoute should be set by now
                    // since we transitioned to 'direction' step. 
                    const res = await fetch(`/api/njt-bus/stops?route=${encodeURIComponent(selectedNjtRoute!)}&direction=${encodeURIComponent(targetDir)}`);
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    setNjtStops(Array.isArray(data) ? data : []);
                    setNjtStep('stop');
                } catch (e: any) {
                    console.error('Failed to fetch stops:', e);
                    setError(e.message);
                } finally {
                    setLoading(false);
                }
            } else {
                // Final stop selection
                const station: Station = {
                    id: s.busstopnumber,
                    name: s.busstopdescription,
                    lines: [selectedNjtRoute!],
                    north_label: 'Arrivals',
                    south_label: 'Arrivals',
                    direction: selectedNjtDirection! // Pass full direction name
                };
                onSelect(station, selectedNjtRoute!, undefined);
            }
        } else if (mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail') {
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
        if (mode === 'njt-bus') {
            if (njtStep === 'route') return 'Select Bus Route';
            if (njtStep === 'direction') return `Route ${selectedNjtRoute}: Direction`;
            if (njtStep === 'stop') return `Route ${selectedNjtRoute}: Select Stop`;
        }
        if (mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail') {
            return originStation ? 'Select Arrival Station' : 'Select Departure Station';
        }
        return mode === 'path' ? 'PATH Station' : `${line || 'Train'} Station`;

    };

    const getPlaceholder = () => {
        if (mode === 'bus') {
            return lockedRoute ? "Filter by Name/Dest..." : "Search Route (e.g. M23)";
        }
        if ((mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail') && originStation) {
            return "Select Arrival Station...";
        }
        if (mode === 'njt-bus') {
            if (njtStep === 'route') return "Search Bus Route (e.g. 158)...";
            if (njtStep === 'direction') return "Select Direction...";
            if (njtStep === 'stop') return "Search for your stop...";
        }
        return "Search station...";
    };

    return (
        <div className="selector">
            <div className="header">
                <button onClick={onBack} className="back-btn">← Back</button>
                <h2>{getTitle()}</h2>
            </div>

            {(mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail') && originStation && (
                <div className="locked-header">
                    <span>From: <strong>{originStation.name}</strong></span>
                    <button onClick={handleReset} className="unlock-btn">Change</button>
                </div>
            )}

            {mode === 'njt-bus' && selectedNjtRoute && (
                <div className="locked-header">
                    <span>Route: <strong>{selectedNjtRoute}</strong> {selectedNjtDirection && `→ ${selectedNjtDirection}`}</span>
                    <button onClick={() => { setNjtStep('route'); setSelectedNjtRoute(null); setSelectedNjtDirection(null); }} className="unlock-btn">Change</button>
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
                ) : mode === 'njt-bus' ? (
                    <>
                        {loading && <div style={{ padding: 16 }}>Loading...</div>}
                        {error && <div style={{ padding: 16, color: 'var(--primary)' }}>{error}</div>}
                        {!loading && !error && filtered.length === 0 && (
                            <div style={{ padding: 16, color: '#888' }}>No results found</div>
                        )}
                        {Array.isArray(filtered) && filtered.map((s, i) => {
                            if (njtStep === 'route') {
                                return (
                                    <button key={s.BusRouteID} className="item icon-item" onClick={() => handleSelect(s)}>
                                        <span className="route-icon orange">{s.BusRouteID}</span>
                                        <span className="route-desc">{s.BusRouteDescription}</span>
                                    </button>
                                );
                            } else if (njtStep === 'direction') {
                                return (
                                    <button key={i} className="item" onClick={() => handleSelect(s)}>
                                        {s}
                                    </button>
                                );
                            } else {
                                return (
                                    <button key={s.busstopnumber} className="item" onClick={() => handleSelect(s)}>
                                        {s.busstopdescription}
                                    </button>
                                );
                            }
                        })}
                    </>
                ) : (
                    filtered.map(s => {
                        let bestRoute: string | undefined;
                        if (mode === 'bus' && s.lines) {
                            const targetQuery = lockedRoute || search;
                            const cleanSearch = targetQuery.trim().toLowerCase();
                            bestRoute = s.lines.find((l: string) => l.toLowerCase().includes(cleanSearch));
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
            min-width: 44px;
            text-align: center;
        }
        .route-icon.orange {
            background: #F7941D;
        }
        .route-desc {
            font-size: 14px;
            color: #ccc;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
