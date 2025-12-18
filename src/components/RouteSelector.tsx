
import React, { useState, useMemo } from 'react';
import njtBusRoutes from '@/lib/njt_bus_routes.json';

interface RouteSelectorProps {
    onSelect: (route: { id: string, shortName: string, longName: string }) => void;
    onBack?: () => void;
}

export default function RouteSelector({ onSelect, onBack }: RouteSelectorProps) {
    const [search, setSearch] = useState('');

    const filteredRoutes = useMemo(() => {
        const q = search.toLowerCase();
        return njtBusRoutes.filter(r =>
            r.shortName.toLowerCase().includes(q) ||
            r.longName.toLowerCase().includes(q)
        ).slice(0, 50); // Limit results for perf
    }, [search]);

    return (
        <div className="selector">
            <div className="header">
                {onBack && (
                    <button onClick={onBack} className="back-btn">
                        ← Back
                    </button>
                )}
                <h2>Select Route</h2>
            </div>

            <div className="search-container">
                <input
                    type="text"
                    placeholder="Search route (e.g. 126, Newark)"
                    className="search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="list">
                {filteredRoutes.map((route) => (
                    <button
                        key={route.id}
                        onClick={() => onSelect(route)}
                        className="item"
                    >
                        <div className="route-row">
                            <span className="route-short">
                                {route.shortName}
                            </span>
                            <span className="route-long">
                                {route.longName}
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            <style jsx>{`
                .selector { height: 100%; display: flex; flex-direction: column; }
                .header { display: flex; align-items: center; margin-bottom: 16px; margin-top: 16px; }
                .back-btn { background: none; color: var(--primary); font-size: 16px; margin-right: 16px; }
                h2 { margin: 0; font-size: 20px; font-weight: bold; }
                
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

                .route-row { display: flex; align-items: center; gap: 12px; }
                .route-short { 
                    font-weight: bold; 
                    font-size: 18px; 
                    color: #F7941D; /* NJT Orange */
                    min-width: 40px;
                }
                .route-long {
                    font-size: 14px;
                    color: #aaa;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            `}</style>
        </div>
    );
}
