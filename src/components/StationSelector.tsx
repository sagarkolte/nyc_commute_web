"use client";

import { useMemo, useState, useEffect } from 'react';
import { Station } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import subwayStationsRaw from '@/lib/stations.json';
import sirStations from '@/lib/sir_stations.json';
const subwayStations = [...subwayStationsRaw, ...sirStations];
import lirrStations from '@/lib/lirr_stations.json';
import mnrStations from '@/lib/mnr_stations.json';
import pathStations from '@/lib/path_stations.json';
import njtStations from '@/lib/njt_stations.json';
import nycFerryStations from '@/lib/nyc_ferry_stations.json';

interface StationSelectorProps {
    mode: 'subway' | 'bus' | 'lirr' | 'mnr' | 'path' | 'njt' | 'njt-bus' | 'njt-rail' | 'nyc-ferry';

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
    const [njtStep, setNjtStep] = useState<'route' | 'origin' | 'destination'>('route');
    const [selectedNjtRoute, setSelectedNjtRoute] = useState<string | null>(null);
    const [selectedNjtDirection, setSelectedNjtDirection] = useState<string | null>(null);

    // New Bus Logic
    const [busStep, setBusStep] = useState<'route' | 'stop'>('route');
    const [busRoutes, setBusRoutes] = useState<any[]>([]);

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
        // Bus Search Logic (Routes)
        if (mode === 'bus' && !lockedRoute && search.length >= 1) {
            const delayDebounceFn = setTimeout(async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/mta/bus-routes?q=${encodeURIComponent(search)}`);
                    const data = await res.json();
                    setBusRoutes(data.routes || []);
                } catch (e) {
                    console.error('Failed to search bus routes', e);
                } finally {
                    setLoading(false);
                }
            }, 600); // 600ms debounce
            return () => clearTimeout(delayDebounceFn);
        } else if (mode === 'bus' && lockedRoute) {
            // Fetch stops for locked route
            if (busStops.length > 0) return;

            const fetchStops = async () => {
                setLoading(true);
                try {
                    const apiKey = CommuteStorage.getApiKey();
                    const headers: any = {};
                    if (apiKey) headers['x-mta-api-key'] = apiKey;

                    const res = await fetch(`/api/mta/bus-stops?routeId=${encodeURIComponent(lockedRoute)}`, { headers });
                    const data = await res.json();
                    setBusStops(data.stops || []);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            };
            fetchStops();
        }
    }, [mode, search, lockedRoute, busStops.length]);

    const handleUnlock = () => {
        setLockedRoute(null);
        setBusStep('route');
        setSearch('');
        setBusStops([]);
        setBusRoutes([]);
    };

    const handleBusRouteSelect = (route: any) => {
        setLockedRoute(route.id);
        setBusStep('stop');
        setSearch('');
    };

    const handleReset = () => {
        setOriginStation(null);
        setSearch('');
    };

    // Simplified uniqueRoutes since we use API for bus routes now
    const uniqueRoutes: any[] = [];

    const filtered = useMemo(() => {
        let data: any[] = [];
        if (mode === 'bus') {
            data = busStops;
            return (data as Station[])
                .filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
        } else if (mode === 'subway') {
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
            const res = (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            if (originStation) {
                return res.filter(s => s.id !== originStation.id);
            }
            return res;
        } else if (mode === 'nyc-ferry') {
            data = nycFerryStations;
            const res = (data as Station[]).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            if (originStation) {
                // Determine valid destinations based on shared lines
                return res.filter(s => s.id !== originStation.id && s.lines.some(l => originStation.lines.includes(l)));
            }
            return res;
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
            } else if (njtStep === 'origin') {
                // Deduplicate origin list by name + destination for UI display
                const seen = new Set();
                return (njtStops || []).filter(s => {
                    const cleanName = (s.busstopdescription || '').toLowerCase();
                    const cleanSearch = search.toLowerCase().replace('harbour', 'harbor');
                    const match = cleanName.includes(cleanSearch) || cleanName.replace('harbour', 'harbor').includes(cleanSearch);

                    // Deduplicate by name + direction name to ensure Inbound and Outbound are both shown
                    const key = `${s.busstopdescription.trim().toLowerCase()}-${s.njt_direction.trim().toLowerCase()}`;
                    if (match && !seen.has(key)) {
                        seen.add(key);
                        return true;
                    }
                    return false;
                });
            } else if (njtStep === 'destination') {
                const sameDirStops = njtStops.filter(st => st.njt_direction === selectedNjtDirection);
                // REMOVE SLICE: NJT API stop order is unreliable. Show all stops except current origin.
                const availableDestinations = sameDirStops.filter(st => st.busstopnumber !== originStation?.id);
                return availableDestinations.filter(s => {
                    const cleanName = (s.busstopdescription || '').toLowerCase();
                    const cleanSearch = search.toLowerCase().replace('harbour', 'harbor');
                    return cleanName.includes(cleanSearch) || cleanName.replace('harbour', 'harbor').includes(cleanSearch);
                });
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
    }, [mode, line, search, busStops, lockedRoute, originStation, njtStep, njtRoutes, njtDirections, njtStops]);

    const handleSelect = async (s: any, routeId?: string) => {
        if (mode === 'njt-bus') {
            if (njtStep === 'route') {
                const targetRouteId = s.BusRouteID;
                setSelectedNjtRoute(targetRouteId);
                setSearch('');
                setLoading(true);
                try {
                    // Fetch directions
                    const dRes = await fetch(`/api/njt-bus/directions?route=${encodeURIComponent(targetRouteId)}`);
                    const dirs = await dRes.json();
                    if (dirs.error) throw new Error(dirs.error);
                    setNjtDirections(Array.isArray(dirs) ? dirs : []);

                    // Fetch stops for ALL directions
                    const allStops: any[] = [];
                    for (const dir of (Array.isArray(dirs) ? dirs : [])) {
                        const sRes = await fetch(`/api/njt-bus/stops?route=${encodeURIComponent(targetRouteId)}&direction=${encodeURIComponent(dir)}`);
                        const data = await sRes.json();
                        if (Array.isArray(data) && data.length > 0) {
                            // Tag each stop with its direction name as the destination label
                            allStops.push(...data.map(stop => ({
                                ...stop,
                                njt_direction: dir,
                                njt_destination: dir // Use API direction name (e.g. "Fort Lee", "New York")
                            })));
                        }
                    }

                    // Deduplicate stops by name + direction for the origin selection
                    const uniqueStopsMap = new Map();
                    allStops.forEach(stop => {
                        const key = `${stop.busstopdescription.trim().toLowerCase()}-${stop.njt_direction}`;
                        if (!uniqueStopsMap.has(key)) {
                            uniqueStopsMap.set(key, stop);
                        }
                    });

                    setNjtStops(allStops); // Keep full list with direction tags for destination filtering
                    setNjtStep('origin');
                } catch (e: any) {
                    console.error('Failed to initialize NJT Bus stops:', e);
                    setError(e.message);
                } finally {
                    setLoading(false);
                }
            } else if (njtStep === 'origin') {
                const targetOrigin = s;
                setOriginStation({
                    id: targetOrigin.busstopnumber,
                    name: targetOrigin.busstopdescription,
                    lines: [selectedNjtRoute!],
                    north_label: 'Arrivals',
                    south_label: 'Arrivals',
                    direction: targetOrigin.njt_direction,
                    njt_destination: targetOrigin.njt_destination
                });

                // Set the direction based on what was picked
                setSelectedNjtDirection(targetOrigin.njt_direction);

                setSearch('');
                // Since stop order is unreliable, we show ALL stops for the chosen direction as targets.
                setNjtStep('destination');
            } else {
                // Final destination selection
                const destStation: Station = {
                    id: s.busstopnumber,
                    name: s.busstopdescription,
                    lines: [selectedNjtRoute!],
                    north_label: 'Arrivals',
                    south_label: 'Arrivals',
                    direction: s.njt_direction
                };
                onSelect(originStation!, selectedNjtRoute!, destStation);
            }
        }
        else if (mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail' || mode === 'path' || mode === 'nyc-ferry') {
            if (!originStation) {
                setOriginStation(s);
                setSearch('');
            } else {
                let inferredRoute = undefined;
                if (mode === 'nyc-ferry') {
                    // Find common line
                    inferredRoute = s.lines.find((l: string) => originStation.lines.includes(l));
                }
                onSelect(originStation, inferredRoute, s);
            }
        } else {
            // Special handling for MTA Bus to inject the 'Clean Destination'
            if (mode === 'bus' && lockedRoute) {
                // Option 2: Heuristic Cleaning using Regex
                // "SELECT BUS CHELSEA PIERS 12AV CROSSTOWN" -> "CHELSEA PIERS 12AV"
                let cleanDest = (s.headsign || s.direction || '').toUpperCase();

                // Remove common prefixes/suffixes
                cleanDest = cleanDest.replace(/SELECT BUS\s+/g, '');
                cleanDest = cleanDest.replace(/\s+CROSSTOWN/g, '');
                cleanDest = cleanDest.replace(/LIMITED/g, '');
                cleanDest = cleanDest.replace(/\s+SBS/g, ''); // Select Bus Service suffix
                cleanDest = cleanDest.trim();

                // Capitalize properly (Title Case)
                const toTitleCase = (str: string) => {
                    return str.replace(
                        /\w\S*/g,
                        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
                    );
                };

                if (cleanDest.length > 0 && cleanDest !== (s.headsign || '').toUpperCase()) {
                    cleanDest = toTitleCase(cleanDest);

                    const fakeDest: Station = {
                        id: 'USER_DEST',
                        name: cleanDest,
                        lines: [],
                        north_label: '',
                        south_label: ''
                    };
                    onSelect(s, routeId, fakeDest);
                    return;
                }
            }

            onSelect(s, routeId);
        }
    };

    const getTitle = () => {
        if (mode === 'njt-bus') {
            if (njtStep === 'route') return 'Select Bus Route';
            if (njtStep === 'origin') return `Route ${selectedNjtRoute}: Starting Point`;
            if (njtStep === 'destination') return `Route ${selectedNjtRoute}: Ending Point`;
        }
        if (mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail' || mode === 'path' || mode === 'nyc-ferry') {
            return originStation ? 'Select Arrival Station' : 'Select Departure Station';
        }
        if (mode === 'bus') return '';
        if (mode === 'subway') return '';
        return `${line || 'Train'} Station`;

    };

    const getPlaceholder = () => {
        if (mode === 'bus') {
            return lockedRoute ? "Search Boarding Stop..." : "Search Route (e.g. M23)";
        }
        if ((mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail' || mode === 'path' || mode === 'nyc-ferry') && originStation) {
            return "Select Arrival Station...";
        }
        if (mode === 'njt-bus') {
            if (njtStep === 'route') return "Search Bus Route (e.g. 158)...";
            if (njtStep === 'origin') return "Search for starting stop...";
            if (njtStep === 'destination') return "Search for ending stop...";
        }
        if (mode === 'subway') return "Search Boarding Station...";
        return "Search station...";
    };

    const handleBack = () => {
        if (mode === 'njt-bus') {
            if (njtStep === 'destination') {
                setNjtStep('origin');
                setOriginStation(null);
                return;
            }
            if (njtStep === 'origin') {
                setNjtStep('route');
                setSelectedNjtRoute(null);
                setSelectedNjtDirection(null);
                return;
            }
        }
        if (mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail' || mode === 'path' || mode === 'nyc-ferry') {
            if (originStation) {
                setOriginStation(null);
                return;
            }
        }
        onBack?.();
    };

    return (
        <div className="selector">
            <div className="header">
                <button onClick={handleBack} className="back-btn">← Back</button>
                <h2>{getTitle()}</h2>
            </div>

            {(mode === 'mnr' || mode === 'njt' || mode === 'lirr' || mode === 'njt-rail' || mode === 'path' || mode === 'nyc-ferry') && originStation && (
                <div className="locked-header">
                    <span>From: <strong>{originStation.name}</strong></span>
                    <button onClick={handleReset} className="unlock-btn">Change</button>
                </div>
            )}

            {mode === 'njt-bus' && selectedNjtRoute && (
                <div className="locked-header">
                    <span>Route: <strong>{selectedNjtRoute}</strong> {originStation && ` ➔ To: ${originStation.njt_destination}`}</span>
                    <button onClick={() => { setNjtStep('route'); setSelectedNjtRoute(null); setSelectedNjtDirection(null); setOriginStation(null); }} className="unlock-btn">Change</button>
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

                        {/* New API Route List */}
                        {busRoutes.map(route => (
                            <button
                                key={route.id}
                                className="item icon-item"
                                onClick={() => handleBusRouteSelect(route)}
                            >
                                <span className="route-icon">{route.shortName}</span>
                                <span className="route-desc" style={{ marginLeft: 10, color: '#aaa', fontSize: '0.9em' }}>{route.longName}</span>
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
                                    <button key={s.BusRouteID} className="item route-list-item" onClick={() => handleSelect(s)}>
                                        <div className="route-badge orange">{s.BusRouteID}</div>
                                        <div className="route-desc">{s.BusRouteDescription}</div>
                                    </button>
                                );
                            } else {
                                return (
                                    <>
                                        {(!s || s.njt_destination !== 'Terminal') && (
                                            <button key={s.busstopnumber + (s.njt_direction || '')} className="item" onClick={() => handleSelect(s)}>
                                                <div className="item-name">{s.busstopdescription}</div>
                                                {njtStep === 'origin' && (
                                                    <div className="route-desc">
                                                        Towards: <strong>{s.njt_destination}</strong>
                                                    </div>
                                                )}
                                            </button>
                                        )}
                                    </>
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
                                {mode === 'bus' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                                        <span style={{ fontSize: '0.85em', color: '#aaa' }}>
                                            To: {(() => {
                                                // Try to derive a clean destination from the route longName
                                                const routeObj = busRoutes.find(r => r.id === lockedRoute);
                                                if (routeObj && routeObj.longName) {
                                                    const parts = routeObj.longName.split(' - ');
                                                    const h = (s.headsign || '').toLowerCase();
                                                    // Simple heuristic: which part of the long name is in the headsign?
                                                    // "Chelsea Piers - East Side" vs "SELECT BUS EAST SIDE..."
                                                    const matchHeight = parts.map((p: string) => {
                                                        const pWords = p.toLowerCase().split(' ');
                                                        let matches = 0;
                                                        pWords.forEach(w => { if (h.includes(w)) matches++; });
                                                        return matches;
                                                    });

                                                    const bestIdx = matchHeight[0] > matchHeight[1] ? 0 : 1;
                                                    // If we have a decent match (at least 1 word), usage that. 
                                                    // Otherwise fallback to headsign.
                                                    if (matchHeight[bestIdx] > 0) return parts[bestIdx];
                                                }
                                                return s.headsign || s.direction || 'Bus';
                                            })()}
                                        </span>
                                    </div>
                                ) : s.name}
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
        .route-badge {
            background: #444;
            color: white;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: bold;
            margin-right: 12px;
            min-width: 50px;
            text-align: center;
            font-size: 14px;
        }
        .route-badge.orange {
            background: #F7941D;
        }
        .route-list-item {
            display: flex;
            align-items: center;
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
