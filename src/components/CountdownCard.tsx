"use client";

import { useEffect, useState } from 'react';
import { CommuteTuple, Arrival } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { Trash2, Grip, AlertTriangle } from 'lucide-react';
import { motion, useMotionValue, useTransform, DragControls } from 'framer-motion';

const COLORS: Record<string, string> = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'L': '#A7A9AC', 'G': '#6CBE45', 'J': '#996633', 'Z': '#996633',
    'SI': '#0039A6',
};

export const CountdownCard = ({ tuple, onDelete, dragControls }: { tuple: CommuteTuple, onDelete: () => void, dragControls?: DragControls }) => {
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
                setDebugInfo((prev: any) => ({ ...prev, alerts: data.alerts }));
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

    const isSBS = tuple.routeId.includes('+') || tuple.routeId.endsWith('-SBS') || tuple.routeId.includes('SBS');
    let badgeText = formatRouteId(tuple.routeId);
    if (isSBS) {
        badgeText = badgeText.replace('-SBS', '');
    }

    const hasRealtime = arrivals.length > 0 && arrivals.some(a => a.isRealtime);

    return (
        <div className="commute-card-container" style={{ position: 'relative', zIndex: debugInfo?.showBubble ? 100 : 1 }}>
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
                    paddingLeft: 12,
                    x
                }}
                drag="x"
                dragConstraints={{ left: -200, right: 0 }}
                dragElastic={{ left: 0.1, right: 0 }}
                dragSnapToOrigin
                onDragEnd={handleDragEnd}
            >
                {dragControls && (
                    <div
                        onPointerDown={(e) => dragControls.start(e)}
                        style={{
                            position: 'absolute',
                            left: 4,
                            bottom: 4,
                            cursor: 'grab',
                            touchAction: 'none',
                            zIndex: 5,
                            opacity: 0.5
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="2" cy="10" r="1.5" fill="#666" />
                            <circle cx="2" cy="5" r="1.5" fill="#666" />
                            <circle cx="7" cy="10" r="1.5" fill="#666" />
                        </svg>
                    </div>
                )}
                {(hasAlert || hasRealtime) && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        zIndex: 20,
                        display: 'flex',
                        alignItems: 'flex-start',
                        pointerEvents: 'none'
                    }}>
                        {hasRealtime && (
                            <div style={{
                                background: 'rgba(74, 222, 128, 0.15)',
                                color: '#4ade80',
                                padding: '0 8px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                fontFamily: 'Helvetica, Arial, sans-serif',
                                letterSpacing: '0.5px',
                                // Shape: Jigsaw piece (Always flat right)
                                borderTopRightRadius: '0',
                                borderBottomRightRadius: '0',
                                borderBottomLeftRadius: '8px',
                                borderTopLeftRadius: '8px'
                            }}>
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', marginRight: '4px',
                                    boxShadow: '0 0 4px #4ade80'
                                }} />
                                LIVE
                            </div>
                        )}

                        {/* If Live exists but Alert doesn't, show placeholder to maintain Live position */}
                        {hasRealtime && !hasAlert && (
                            <div style={{ width: '24px', height: '24px' }} />
                        )}

                        {hasAlert && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDebugInfo((prev: any) => ({ ...prev, showBubble: !prev?.showBubble }));
                                }}
                                style={{
                                    background: '#FFD100',
                                    borderTopRightRadius: '12px',
                                    borderBottomLeftRadius: '0',
                                    borderTopLeftRadius: '0',
                                    borderBottomRightRadius: '0',
                                    width: '24px',
                                    height: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    border: 'none',
                                    padding: 0,
                                    color: '#000',
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                    pointerEvents: 'auto'
                                }}
                            >
                                !
                            </button>
                        )}
                    </div>
                )}

                {isSBS && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            background: '#1C1C1E', // Match card bg
                            borderBottomRightRadius: '8px',
                            borderTopLeftRadius: '12px', // Match card rounded corner
                            borderRight: '1px solid #333',
                            borderBottom: '1px solid #333',
                            padding: '4px 8px',
                            zIndex: 15,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1
                        }}
                    >
                        <span style={{ color: '#009BDB', fontWeight: 'bold', fontSize: '10px', fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '0.5px' }}>
                            +Select
                        </span>
                    </div>
                )}

                <div className="commute-card-header">
                    <div style={{ width: '85px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexShrink: 0, marginRight: '8px' }}>
                        <div className="commute-card-badge" style={{ backgroundColor: lineColor, width: badgeText.length > 3 ? 'auto' : '40px', padding: badgeText.length > 3 ? '0 10px' : '0', marginRight: 0 }}>
                            {badgeText}
                        </div>
                    </div>
                    {/* Alert logic moved to corner */}
                    <div className="commute-card-info">
                        {/* Bubble moved here to be relative to the header area but visually triggered from corner */}
                        {debugInfo?.showBubble && (
                            <div style={{
                                position: 'absolute',
                                top: '30px',
                                right: '10px',
                                width: '250px',
                                backgroundColor: '#222',
                                border: '1px solid #444',
                                borderRadius: '8px',
                                padding: '12px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                zIndex: 100,
                                color: '#eee',
                                textAlign: 'left'
                            }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#FFD100' }}>Service Alert</h4>
                                {debugInfo?.alerts?.map((alert: any, idx: number) => (
                                    <div key={idx} style={{ marginBottom: '8px', fontSize: '12px' }}>
                                        <div style={{ fontWeight: 'bold' }}>{alert.header}</div>
                                    </div>
                                ))}
                                {(!debugInfo?.alerts || debugInfo.alerts.length === 0) && <div style={{ fontSize: '12px' }}>Check mta.info for details.</div>}
                            </div>
                        )}
                        <h3>{(() => {
                            const fullLabel = toTitleCase(tuple.label);
                            const subtitle = tuple.destinationName ? toTitleCase(tuple.destinationName) :
                                (tuple.routeId === 'SI' && tuple.direction === 'N') ? 'To Tottenville' :
                                    (tuple.routeId === 'SI' && tuple.direction === 'S') ? 'To St. George' :
                                        tuple.direction === 'N' ? 'Uptown / North' :
                                            tuple.direction === 'S' ? 'Downtown / South' :
                                                tuple.direction; // This is the exact subtitle text

                            // 1. Try to split by " - " which is common for some routes
                            const parts = fullLabel.split(' - ');
                            let displayLabel = fullLabel;
                            if (parts.length > 1) {
                                displayLabel = parts[0];
                            }

                            // 2. Try to remove the subtitle if it's part of the label (common in "Stop (Headsign)" format from StationSelector)
                            if (subtitle && fullLabel.toLowerCase().includes(subtitle.toLowerCase())) {
                                // Remove subtitle and parenthesis if present
                                displayLabel = fullLabel.replace(new RegExp(`\\s*\\(?${subtitle}\\)?`, 'i'), '').trim();

                                // ALSO remove trailing separators left behind (like " - " or " ➔ " or " to ")
                                displayLabel = displayLabel.replace(/[\s\-➔→>]+$/, '').trim();
                                displayLabel = displayLabel.replace(/\s+to$/, '').trim(); // Handle "Origin to Dest"
                            }

                            // FOR MNR/Departure Boards: Combine Origin -> Dest
                            if (isDepartureBoard && tuple.destinationName) {
                                return (
                                    <span>
                                        {displayLabel} <span style={{ opacity: 0.7, padding: '0 4px' }}>→</span> {toTitleCase(tuple.destinationName)}
                                    </span>
                                );
                            }

                            return displayLabel;
                        })()}</h3>
                        <p>
                            {isFerry && tuple.routeId !== 'NYC Ferry' && tuple.routeId !== 'nyc-ferry' ? (
                                <span style={{ fontWeight: 600, color: lineColor, marginRight: '8px' }}>{tuple.routeId}</span>
                            ) : null}
                            {/* Hide subtitle for Departure Boards since it's now in the title */}
                            {!isDepartureBoard && (
                                tuple.destinationName ? toTitleCase(tuple.destinationName) :
                                    (tuple.routeId === 'SI' && tuple.direction === 'N') ? 'To Tottenville' :
                                        (tuple.routeId === 'SI' && tuple.direction === 'S') ? 'To St. George' :
                                            tuple.direction === 'N' ? 'Uptown / North' :
                                                tuple.direction === 'S' ? 'Downtown / South' :
                                                    tuple.direction
                            )}
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
                                <span className="commute-board-col-track">{!isFerry ? 'TRACK' : ''}</span>
                                <span className="commute-board-col-arrives">ARRIVES</span>
                                <span className="commute-board-col-eta">ETA</span>
                            </div>
                            {arrivals.slice(0, 3).map((arr: any, i: number) => (
                                <div key={i} className="commute-board-row">
                                    <span className="commute-board-col-time">{formatTime(arr.time)}</span>
                                    <span className="commute-board-col-dest">{toTitleCase(arr.destination || 'Unknown')}</span>
                                    <span className="commute-board-col-track">{!isFerry ? (arr.track || 'TBD') : '--'}</span>
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
        </div >
    );
};
