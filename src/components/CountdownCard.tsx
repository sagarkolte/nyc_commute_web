"use client";

import { useEffect, useState } from 'react';
import { CommuteTuple, Arrival } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { Trash2, TriangleAlert } from 'lucide-react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

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
    const [hasAlert, setHasAlert] = useState(false);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // For swipe-to-delete
    // For swipe-to-delete
    const x = useMotionValue(0);
    // Reveal background immediately (opacity 1) but scale the icon
    const iconOpacity = useTransform(x, [-50, -10], [1, 0]);
    const iconScale = useTransform(x, [-100, -20], [1, 0.5]);

    const handleDragEnd = (_: any, info: any) => {
        if (info.offset.x < -100) {
            onDelete();
        }
    };

    const fetchArrivals = async () => {
        // ... rest of fetchArrivals ...
        try {
            setLoading(true);
            const apiKey = CommuteStorage.getApiKey();
            const headers: HeadersInit = {};
            if (apiKey) headers['x-mta-api-key'] = apiKey;

            const routeId = encodeURIComponent(tuple.routeId);
            const stopId = encodeURIComponent(tuple.stopId);
            const direction = encodeURIComponent(tuple.direction);
            const destStopId = tuple.destinationStopId ? encodeURIComponent(tuple.destinationStopId) : '';

            const isNjt = tuple.routeId === 'NJT';
            const isNjtBus = tuple.mode === 'njt-bus';
            let endpoint = '/api/mta';
            if (isNjt) endpoint = '/api/njt';
            if (isNjtBus) endpoint = '/api/njt-bus';
            if (tuple.routeId === 'SI Ferry') endpoint = '/api/si-ferry';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

            const res = await fetch(`${endpoint}?_t=${Date.now()}&routeId=${routeId}&stopId=${stopId}&direction=${direction}&destStopId=${destStopId}`, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Status ${res.status}: ${txt}`);
            }
            const data = await res.json();
            if (data.arrivals) {
                // Sorting logic: if destinationArrivalTime exists, sort by that.
                // Otherwise sort by departure time.
                const sorted = [...data.arrivals].sort((a, b) => {
                    const timeA = a.destinationArrivalTime || a.time;
                    const timeB = b.destinationArrivalTime || b.time;
                    return timeA - timeB;
                });
                setArrivals(sorted);
                setHasAlert(data.alerts && data.alerts.length > 0);
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

    const isNjtBus = tuple.mode === 'njt-bus';
    const isFerry = tuple.routeId === 'NYC Ferry' || tuple.routeId === 'nyc-ferry' || tuple.routeId === 'SI Ferry' || tuple.routeId === 'si-ferry';
    const lineColor = COLORS[tuple.routeId] || (tuple.routeId.startsWith('MNR') || tuple.routeId === 'LIRR' ? '#0039A6' : (tuple.routeId === 'NJT' || tuple.routeId === 'NJT Bus' || isNjtBus ? '#F7941D' : (isFerry ? '#00839C' : '#999'))); // MNR/LIRR Blue, NJT Orange
    // isDepartureBoard should be TRUE if we have a destinationStopId (like for Rail)
    // For NJT Bus V2, it's stop-centric, so we don't usually have a destinationStopId unless explicitly picked.
    // If it's FALSE, it shows the card's main label as the destination.
    const isDepartureBoard = (tuple.routeId.startsWith('MNR') || tuple.routeId === 'NJT' || tuple.routeId === 'LIRR' || tuple.routeId === 'PATH' || tuple.routeId === 'NYC Ferry' || tuple.routeId === 'nyc-ferry') && !!tuple.destinationStopId;

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

    const badgeText = formatRouteId(tuple.routeId);

    return (
        <div className="commute-card-container">
            {/* Delete Background - Always visible behind, but icon animates */}
            <div className="commute-card-delete-bg">
                <motion.div style={{ opacity: iconOpacity, scale: iconScale }}>
                    <Trash2 size={24} color="white" />
                </motion.div>
                <motion.span style={{ opacity: iconOpacity }}>Delete</motion.span>
            </div>

            {/* Draggable Card */}
            <motion.div
                className={`commute-card ${isDepartureBoard ? 'mnr-card' : ''}`}
                style={{
                    borderLeft: `6px solid ${lineColor}`,
                    x
                }}
                drag="x"
                dragConstraints={{ left: -200, right: 0 }}
                dragElastic={0.1}
                onDragEnd={handleDragEnd}
            >
                <div className="commute-card-header">
                    <div className="commute-card-badge" style={{ backgroundColor: lineColor, width: badgeText.length > 3 ? 'auto' : '40px', padding: badgeText.length > 3 ? '0 10px' : '0' }}>
                        {badgeText}
                    </div>
                    {hasAlert && (
                        <div style={{ marginRight: 8 }}>
                            <TriangleAlert size={20} color="#FFD100" fill="#FFD100" stroke="#000" strokeWidth={1.5} />
                        </div>
                    )}
                    <div className="commute-card-info">
                        <h3>{(() => {
                            const fullLabel = toTitleCase(tuple.label);
                            const subtitle = tuple.destinationName ? toTitleCase(tuple.destinationName) :
                                tuple.direction === 'N' ? 'Uptown / North' :
                                    tuple.direction === 'S' ? 'Downtown / South' :
                                        tuple.direction; // This is the exact subtitle text

                            // 1. Try to split by " - " which is common for some routes
                            const parts = fullLabel.split(' - ');
                            if (parts.length > 1) {
                                return parts[0];
                            }

                            // 2. Try to remove the subtitle if it's part of the label (common in "Stop (Headsign)" format from StationSelector)
                            if (subtitle && fullLabel.toLowerCase().includes(subtitle.toLowerCase())) {
                                // Remove subtitle and parenthesis if present
                                return fullLabel.replace(new RegExp(`\\s*\\(?${subtitle}\\)?`, 'i'), '').trim();
                            }

                            return fullLabel;
                        })()}</h3>
                        <p>
                            {isFerry && tuple.routeId !== 'NYC Ferry' && tuple.routeId !== 'nyc-ferry' ? (
                                <span style={{ fontWeight: 600, color: lineColor, marginRight: '8px' }}>{tuple.routeId}</span>
                            ) : null}
                            {tuple.destinationName ? toTitleCase(tuple.destinationName) :
                                tuple.direction === 'N' ? 'Uptown / North' :
                                    tuple.direction === 'S' ? 'Downtown / South' :
                                        tuple.direction}
                        </p>
                        {tuple.routeId === 'SI Ferry' && <div className="schedule-badge">SCHEDULE ONLY</div>}
                    </div>
                </div>

                <div className="commute-card-body">
                    {loading && arrivals.length === 0 ? (
                        <div className="commute-card-state">Loading...</div>
                    ) : error ? (
                        <div className="commute-card-state error">{error}</div>
                    ) : arrivals.length === 0 ? (
                        <div className="commute-card-state">No Info</div>
                    ) : isDepartureBoard ? (
                        <div className="commute-board-container">
                            <div className="commute-board-header">
                                <span className="commute-board-col-time">TIME</span>
                                <span className="commute-board-col-dest">DESTINATION</span>
                                {!isFerry && <span className="commute-board-col-track">TRACK</span>}
                                <span className="commute-board-col-arrives">ARRIVES</span>
                                <span className="commute-board-col-eta">ETA</span>
                            </div>
                            {arrivals.slice(0, 3).map((arr: any, i: number) => (
                                <div key={i} className="commute-board-row">
                                    <span className="commute-board-col-time">{formatTime(arr.time)}</span>
                                    <span className="commute-board-col-dest">{toTitleCase(arr.destination || 'Unknown')}</span>
                                    {!isFerry && <span className="commute-board-col-track">{arr.track || 'TBD'}</span>}
                                    <span className="commute-board-col-arrives">{arr.destinationArrivalTime ? formatTime(arr.destinationArrivalTime) : '--'}</span>
                                    <span className="commute-board-col-eta">{arr.minutesUntil} min</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="commute-card-arrivals">
                            {arrivals.slice(0, 3).map((arrival: any, i: number) => (
                                <div key={i} className="commute-arrival-item">
                                    <span className="commute-arrival-min">{arrival.minutesUntil < 0 ? 0 : arrival.minutesUntil}</span>
                                    <span className="commute-arrival-label">min</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
