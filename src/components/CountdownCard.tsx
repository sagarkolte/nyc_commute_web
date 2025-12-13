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

            const res = await fetch(`/api/mta?routeId=${tuple.routeId}&stopId=${tuple.stopId}&direction=${tuple.direction}`, {
                headers
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Status ${res.status}: ${txt}`);
            }
            const data = await res.json();
            if (data.arrivals) {
                setArrivals(data.arrivals);
                setDebugInfo(data.debug);
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

    const lineColor = COLORS[tuple.routeId] || '#999';

    // Helper to format route display name
    const formatRouteId = (id: string) => {
        return id.replace('MTA NYCT_', '')
            .replace('MTABC_', '')
            .replace('+', '-SBS'); // Common convention for SBS
    };

    return (
        <div className="card" style={{ borderLeft: `6px solid ${lineColor}` }}>
            <div className="card-header">
                <div className="badge" style={{ backgroundColor: lineColor }}>
                    {formatRouteId(tuple.routeId)}
                </div>
                <div className="info">
                    <h3>{tuple.label}</h3>
                    <p>
                        {tuple.destinationName ? tuple.destinationName :
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
                    <div className="empty" style={{ fontSize: '9px', lineHeight: 1.2, color: '#666' }}>
                        No Info<br />
                        {debugInfo ? (
                            <div style={{ marginTop: '2px', fontSize: '8px', color: '#888' }}>
                                E:{debugInfo.feedEntityCount} R:{debugInfo.routeIdMatchCount} S:{debugInfo.stopMatchCount}<br />
                                T:{debugInfo.serverTime} A:{debugInfo.lastArrivalTime}<br />
                                Routes: {debugInfo.sampleRoutes?.join(', ')}
                            </div>
                        ) : '.'}
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
        }
        .badge {
          min-width: 32px;
          height: 32px;
          padding: 0 6px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          margin-right: 10px;
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
