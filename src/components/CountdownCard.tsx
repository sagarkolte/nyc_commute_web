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
    const [error, setError] = useState(false);

    const fetchArrivals = async () => {
        try {
            setLoading(true);
            const apiKey = CommuteStorage.getApiKey();
            const headers: HeadersInit = {};
            if (apiKey) headers['x-mta-api-key'] = apiKey;

            const res = await fetch(`/api/mta?routeId=${tuple.routeId}&stopId=${tuple.stopId}&direction=${tuple.direction}`, {
                headers
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            if (data.arrivals) {
                setArrivals(data.arrivals);
                setError(false);
            }
        } catch {
            setError(true);
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
                    <div className="error">Error</div>
                ) : arrivals.length === 0 ? (
                    <div className="empty">No info</div>
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
          padding: 16px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-header {
           display: flex;
           align-items: center;
           flex: 1;
        }
        .badge {
          min-width: 36px;
          height: 36px;
          padding: 0 8px; /* Horizontal padding for long text */
          border-radius: 18px; /* Pill shape */
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px; /* Slightly smaller font for better fit */
          margin-right: 12px;
          color: white;
          white-space: nowrap;
        }
        .info h3 { margin: 0; font-size: 16px; font-weight: 600; }
        .info p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
        .arrivals { display: flex; gap: 12px; }
        .arrival-item { display: flex; flex-direction: column; align-items: center; }
        .min { font-size: 24px; font-weight: bold; }
        .label { font-size: 10px; color: var(--text-muted); }
        .delete-btn { background: none; margin-left: auto; padding: 8px; }
      `}</style>
        </div>
    );
};
