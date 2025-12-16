"use client";

import { useEffect, useState } from 'react';
import { CommuteTuple, Arrival } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { Trash2 } from 'lucide-react';

const COLORS: Record<string, string> = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'L': '#A7A9AC', 'G': '#6CBE45', 'J': '#996633', 'Z': '#996633',
};

export const CountdownCard = ({ tuple, onDelete }: { tuple: CommuteTuple, onDelete: () => void }) => {
    const [arrivals, setArrivals] = useState<Arrival[]>([]);
    const [loading, setLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchArrivals = async () => {
        try {
            setLoading(true);
            const apiKey = CommuteStorage.getApiKey();
            const headers: HeadersInit = {};
            if (apiKey) headers['x-mta-api-key'] = apiKey;

            const routeId = encodeURIComponent(tuple.routeId);
            const stopId = encodeURIComponent(tuple.stopId);
            const direction = encodeURIComponent(tuple.direction);
            const destStopId = tuple.destinationStopId ? encodeURIComponent(tuple.destinationStopId) : '';

            const res = await fetch(`/api/mta?_t=${Date.now()}&routeId=${routeId}&stopId=${stopId}&direction=${direction}&destStopId=${destStopId}`, {
                headers
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Status ${res.status}: ${txt}`);
            }
            const data = await res.json();
            if (data.arrivals) {
                setArrivals(data.arrivals);
                setDebugInfo(null);
                setError(null);
            } else if (data.error) {
                throw new Error(data.error);
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Unknown Error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArrivals();
        const interval = setInterval(fetchArrivals, 30000);
        return () => clearInterval(interval);
    }, []);

    const lineColor = COLORS[tuple.routeId] || (tuple.routeId.startsWith('MNR') ? '#0039A6' : '#999'); // MNR default Blue
    const isDeptureBoard = tuple.routeId.startsWith('MNR') && !!tuple.destinationStopId;

    const formatTime = (ts: number) => {
        return new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    };

    // ... helpers ...

    const formatRouteId = (id: string) => {
        return id.replace('MTA NYCT_', '')
            .replace('MTABC_', '')
            .replace('+', '-SBS');
    };

    const toTitleCase = (str: string) => {
        return str.replace(/\w\S*/g, (txt) => {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    };

    // ... (logic remains)

    // Common Header Props
    const lineColor = COLORS[tuple.routeId] || (tuple.routeId.startsWith('MNR') ? '#0039A6' : '#999');
    const badgeText = formatRouteId(tuple.routeId);

    return (
        <div className={`card ${isDeptureBoard ? 'mnr-card' : ''}`} style={{ borderLeft: `6px solid ${lineColor}` }}>
            <div className="card-header">
                <div className="badge" style={{ backgroundColor: lineColor }}>
                    {badgeText}
                </div>
                <div className="info">
                    <h3>{toTitleCase(tuple.label)}</h3>
                    <p>
                        {tuple.destinationName ? toTitleCase(tuple.destinationName) :
                            tuple.direction === 'N' ? 'Uptown / North' :
                                tuple.direction === 'S' ? 'Downtown / South' :
                                    `Direction: ${tuple.direction}`}
                    </p>
                </div>
                <button className="delete-btn" onClick={onDelete}>
                    <Trash2 size={16} color="#666" />
                </button>
            </div>

            <div className="card-body">
                {loading && arrivals.length === 0 ? (
                    <div className="state-msg">Loading...</div>
                ) : error ? (
                    <div className="state-msg error">{error}</div>
                ) : arrivals.length === 0 ? (
                    <div className="state-msg">No Info</div>
                ) : isDeptureBoard ? (
                    <div className="board-container">
                        <div className="board-header-row">
                            <span className="th-time">TIME</span>
                            <span className="th-dest">DESTINATION</span>
                        </div>
                        {arrivals.map((arr, i) => (
                            <div key={i} className="board-row">
                                <span className="td-time">{formatTime(arr.time)}</span>
                                <span className="td-dest">{toTitleCase(arr.destination || 'Unknown')}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="arrivals-list">
                        {arrivals.map((arrival, i) => (
                            <div key={i} className="arrival-item">
                                <span className="min">{arrival.minutesUntil < 0 ? 0 : arrival.minutesUntil}</span>
                                <span className="label">min</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style jsx>{`
                .card {
                  background: var(--card-bg);
                  border-radius: 12px;
                  padding: 12px;
                  margin-bottom: 12px;
                  display: flex;
                  flex-direction: column; /* Changed to column to support vertical body */
                  gap: 10px;
                  min-height: 80px;
                  position: relative;
                }
                .card-header {
                   display: flex;
                   align-items: center;
                   width: 100%;
                }
                /* Badge/Info/Delete from original */
                .badge {
                  min-width: 32px; height: 32px; padding: 0 8px; border-radius: 16px;
                  display: flex; align-items: center; justify-content: center;
                  font-weight: bold; font-size: 11px; margin-right: 12px;
                  color: white; white-space: nowrap; flex-shrink: 0;
                }
                .info { flex: 1; min-width: 0; margin-right: 4px; }
                .info h3 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
                .info p { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .delete-btn { background: none; border: none; padding: 4px; cursor: pointer; opacity: 0.5; }

                .card-body {
                    width: 100%;
                }

                /* Standard Arrivals List */
                .arrivals-list { 
                  display: flex; gap: 8px; justify-content: flex-end; /* Align right to match original look? */
                }
                /* Actually original was row layout: Header | Body(Right). 
                   If we switch to Column, the body is below. 
                   For Standard Layout, we want Body to be RIGHT aligned next to header?
                   No, standard layout was Header(Left) ... Arrivals(Right).
                   MNR Layout is Header(Top) ... Board(Bottom).
                   
                   To support BOTH:
                   - If Standard: .card propery 'flex-direction: row'.
                   - If MNR: .card property 'flex-direction: column'.
                */
                .card:not(.mnr-card) {
                    flex-direction: row;
                    align-items: center;
                }
                .card.mnr-card {
                    flex-direction: column;
                    align-items: stretch;
                }
                
                .state-msg { font-size: 11px; color: #666; text-align: right; width: 100%; }
                
                .arrival-item { display: flex; flex-direction: column; align-items: center; width: 28px; }
                .min { font-size: 18px; font-weight: bold; line-height: 1.2; }
                .label { font-size: 9px; color: var(--text-muted); }

                /* MNR Board Styles */
                .board-container {
                    background: #000;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 8px;
                    margin-top: 4px;
                    font-family: monospace;
                }
                .board-header-row {
                    display: flex;
                    border-bottom: 1px solid #333;
                    padding-bottom: 4px;
                    margin-bottom: 4px;
                    color: #C41230; /* Red Header */
                    font-size: 11px;
                    font-weight: bold;
                }
                .board-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                    color: #FCCC0A; /* Gold Text */
                    font-size: 13px;
                }
                .th-time, .td-time { width: 70px; text-align: left; }
                .th-dest, .td-dest { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            `}</style>
        </div>
    );
};
