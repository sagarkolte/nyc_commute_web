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

    if (isDeptureBoard) {
        return (
            <div className="card board-card">
                <div className="board-header">
                    <span className="board-title">{toTitleCase(tuple.label)}</span>
                    <button className="delete-btn-board" onClick={onDelete}><Trash2 size={14} color="#aaa" /></button>
                </div>

                <div className="board-grid">
                    <div className="board-row header-row">
                        <div className="col-time">TIME</div>
                        <div className="col-dest">DESTINATION</div>
                    </div>
                    {loading && arrivals.length === 0 ? (
                        <div className="board-msg">Loading...</div>
                    ) : error ? (
                        <div className="board-msg error">{error}</div>
                    ) : arrivals.length === 0 ? (
                        <div className="board-msg">No Trains Found</div>
                    ) : (
                        arrivals.map((arr, i) => (
                            <div key={i} className="board-row">
                                <div className="col-time">{formatTime(arr.time)}</div>
                                <div className="col-dest">{toTitleCase(arr.destination || 'Unknown')}</div>
                            </div>
                        ))
                    )}
                </div>

                <style jsx>{`
                    .board-card {
                        background: #000;
                        border: 1px solid #333;
                        border-left: 6px solid #C41230; /* MNR Red? or Default Blue */
                        flex-direction: column;
                        align-items: stretch;
                        padding: 0;
                        overflow: hidden;
                    }
                    .board-header {
                        padding: 8px 12px;
                        background: #222;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #333;
                    }
                    .board-title {
                        font-family: monospace;
                        color: #FCCC0A; /* Gold */
                        font-weight: bold;
                        font-size: 14px;
                    }
                    .delete-btn-board { background:none; border:none; cursor: pointer; }
                    .board-grid {
                        padding: 8px;
                        display: flex;
                        flex-direction: column;
                        font-family: monospace;
                    }
                    .board-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 4px;
                        font-size: 14px;
                    }
                    .header-row {
                        color: #C41230; /* Red headers */
                        font-weight: bold;
                        border-bottom: 1px solid #333;
                        margin-bottom: 8px;
                        padding-bottom: 2px;
                        font-size: 12px;
                    }
                    .col-time { width: 70px; color: #FCCC0A; text-align: left; }
                    .col-dest { flex: 1; color: #FCCC0A; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px;}
                    .board-msg { color: #666; font-family: monospace; text-align: center; padding: 10px; font-size: 12px; }
                 `}</style>
            </div>
        );
    }

    return (
        <div className="card" style={{ borderLeft: `6px solid ${lineColor}` }}>
            <div className="card-header">
                <div className="badge" style={{ backgroundColor: lineColor }}>
                    {formatRouteId(tuple.routeId)}
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

            <div className="arrivals">
                {loading && arrivals.length === 0 ? (
                    <div className="loading">Loading...</div>
                ) : error ? (
                    <div className="error" style={{ fontSize: '10px', color: 'red', lineHeight: 1.2, maxWidth: '80px', overflow: 'hidden' }}>{error}</div>
                ) : arrivals.length === 0 ? (
                    <div className="empty" style={{ fontSize: '11px', lineHeight: 1.2, color: '#666' }}>
                        No Info
                    </div>
                ) : (
                    arrivals.map((arrival, i) => (
                        <div key={i} className="arrival-item">
                            <span className="min">{arrival.minutesUntil < 0 ? 0 : arrival.minutesUntil}</span>
                            <span className="label">min</span>
                        </div>
                    ))
                )}
            </div>

            <style jsx>{`
        .card {
          background: var(--card-bg);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 80px;
        }
        .card-header {
           display: flex;
           align-items: center;
           flex: 1;
           min-width: 0;
           padding-right: 8px;
        }
        .badge {
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 11px;
          margin-right: 12px;
          color: white;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .info {
          flex: 1;
          min-width: 0;
          margin-right: 4px;
        }
        .info h3 { 
          margin: 0; 
          font-size: 14px; 
          font-weight: 600;
          line-height: 1.2;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          white-space: normal;
        }
        .info p { 
          margin: 2px 0 0; 
          font-size: 11px; 
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .arrivals { 
          display: flex; 
          gap: 8px; 
          flex-shrink: 0; 
          text-align: right;
        }
        .arrival-item { display: flex; flex-direction: column; align-items: center; width: 28px; }
        .min { font-size: 18px; font-weight: bold; line-height: 1.2; }
        .label { font-size: 9px; color: var(--text-muted); }
        .delete-btn { 
            background: none; 
            padding: 4px; 
            flex-shrink: 0;
            opacity: 0.5;
        }
      `}</style>
        </div>
    );
};
