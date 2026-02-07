"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommuteTuple, Station, CommuteDirection } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { StationSelector } from '@/components/StationSelector';
import Link from 'next/link';
import { X, ArrowLeft } from 'lucide-react';

const LINES = [
    '1', '2', '3', '4', '5', '6', '7',
    'A', 'C', 'E', 'B', 'D', 'F', 'M',
    'N', 'Q', 'R', 'W', 'J', 'Z', 'G', 'L', 'S', 'SI'
];

type Step = 'mode' | 'line' | 'station' | 'direction' | 'route';

export default function AddPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('mode');
    const [subModeStep, setSubModeStep] = useState<string | null>(null); // For handling NJT Train vs Bus, or Ferry types
    const [mode, setMode] = useState<CommuteTuple['mode'] | 'lirr' | 'mnr' | 'path' | 'njt' | 'njt-bus' | 'njt-rail' | 'nyc-ferry' | 'si-ferry'>('subway');
    const [line, setLine] = useState('');
    const [station, setStation] = useState<Station | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<{ id: string, shortName: string } | null>(null);

    const handleModeSelect = (m: 'subway' | 'bus' | 'lirr' | 'mnr' | 'path' | 'njt' | 'ferry') => {
        if (m === 'njt') {
            setSubModeStep('njt');
            return;
        }
        if (m === 'ferry') {
            setSubModeStep('ferry');
            return;
        }

        setMode(m as any);
        if (m === 'subway') setStep('line');
        else if (m === 'lirr') {
            setLine('LIRR');
            setStep('station');
        } else if (m === 'mnr') {
            setLine('MNR');
            setStep('station');
        } else if (m === 'path') {
            setLine('PATH');
            setStep('station');
        }
        else setStep('station'); // Bus
    };

    const handleSubModeSelect = (sm: 'njt-rail' | 'njt-bus' | 'nyc-ferry' | 'si-ferry') => {
        setMode(sm);
        if (sm === 'njt-rail') {
            setLine('NJT'); // Rail
            setStep('station');
        } else if (sm === 'njt-bus') {
            setLine('NJT Bus');
            setStep('station');
        } else if (sm === 'nyc-ferry') {
            setLine('NYC Ferry');
            setStep('station');
        } else if (sm === 'si-ferry') {
            setLine('SI Ferry');
            setStep('direction'); // Directly to direction for SI Ferry as it's just the two terminals
        }
        setSubModeStep(null);
    };

    const handleLineSelect = (l: string) => {
        setLine(l);
        setStep('station');
    };

    const handleStationSelect = (s: Station, routeId?: string, destStation?: Station) => {
        setStation(s);
        // For Bus, the station already implies direction (it's a specific stop)
        if (mode === 'bus') {
            saveTuple(s, (s.direction as any) || 'N', routeId, destStation);
        } else if (mode === 'njt-bus') {
            // NJ Transit BUS V2: Origin-Destination selection
            saveTuple(s, s.direction || 'N', routeId, destStation);
        } else if (mode === 'nyc-ferry' && destStation) {
            saveTuple(s, 'N', 'nyc-ferry', destStation);
        } else if ((mode === 'lirr' || mode === 'mnr' || mode === 'path' || mode === 'njt' || mode === 'njt-rail') && destStation) {
            const specificRouteId = (mode === 'njt' || mode === 'njt-rail') ? 'NJT' : (mode === 'lirr' ? 'LIRR' : (mode === 'mnr' ? 'MNR' : undefined));
            saveTuple(s, 'N', specificRouteId, destStation);
        } else {
            setStep('direction');
        }
    };

    const saveTuple = (s: Station, dir: CommuteDirection, specificRouteId?: string, destStation?: Station) => {
        let finalMode: any = mode;
        if (['lirr', 'mnr', 'path', 'njt', 'nyc-ferry', 'si-ferry'].includes(mode)) {
            finalMode = 'rail';
        }
        // njt-bus and njt-rail should represent themselves

        const newTuple: CommuteTuple = {
            id: Date.now().toString(),
            label: `${s.name} (${mode})`,
            mode: finalMode,
            routeId: specificRouteId || line,
            stopId: s.id,
            direction: dir,
            destinationName: s.headsign, // For Bus
            destinationStopId: destStation?.id, // For MNR/NJT
            createdAt: Date.now(),
            lat: s.lat,
            lon: s.lon
        };

        if (['lirr', 'mnr', 'path', 'njt', 'njt-rail', 'njt-bus', 'nyc-ferry', 'si-ferry'].includes(mode)) {
            if (destStation) {
                newTuple.label = `${s.name} ➔ ${destStation.name}`;
                newTuple.destinationName = destStation.name;
            } else if (mode === 'si-ferry') {
                const destName = dir === 'N' ? 'Manhattan' : 'St. George';
                const originName = dir === 'N' ? 'St. George' : 'Manhattan';
                newTuple.label = `${originName} ➔ ${destName}`;
                newTuple.destinationName = destName;
                newTuple.stopId = dir === 'N' ? 'st-george' : 'whitehall';
                newTuple.destinationStopId = dir === 'N' ? 'whitehall' : 'st-george';
                // Hardcode coordinates for Sorting
                if (dir === 'N') { // From St. George
                    newTuple.lat = 40.6437;
                    newTuple.lon = -74.0736;
                } else { // From Whitehall
                    newTuple.lat = 40.7014;
                    newTuple.lon = -74.0132;
                }
            } else {
                newTuple.label = `${s.name} - ${dir === 'N' ? 'NYC Bound' : 'NJ/Outbound'}`;
                if (mode === 'lirr' || mode === 'mnr') {
                    newTuple.label = `${s.name} - ${dir === 'N' ? 'Westbound' : 'Eastbound'}`;
                }
            }
        } else if (mode === 'bus') {
            newTuple.label = s.name;
            if (destStation && destStation.id === 'USER_DEST') {
                newTuple.destinationName = destStation.name;
            }
        } else {
            newTuple.label = `${s.name} to ${dir === 'N' ? (s.north_label || 'North') : (s.south_label || 'South')}`;
        }

        CommuteStorage.addTuple(newTuple);
        router.push('/');
    };

    const handleDirectionSelect = (dir: 'N' | 'S') => {
        if (mode === 'si-ferry') {
            saveTuple({ id: 'dummy', name: 'SI Ferry', lines: [] } as any, dir);
        } else {
            if (!station) return;
            saveTuple(station, dir);
        }
    };

    return (
        <main className="container">
            {step === 'mode' && !subModeStep && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <h1 style={{ margin: 0, fontSize: 28 }}>Add Route</h1>
                        <Link href="/" style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            background: '#2C2C2E',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <X color="#fff" size={20} />
                        </Link>
                    </div>

                    <div className="mode-grid">
                        <button className="mode-tile" onClick={() => handleModeSelect('subway')}>
                            <span className="label">Subway</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('lirr')}>
                            <span className="label">LIRR</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('mnr')}>
                            <span className="label">Metro-North</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('njt')}>
                            <span className="label">NJ Transit</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('path')}>
                            <span className="label">PATH</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('ferry')}>
                            <span className="label">Ferry</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleModeSelect('bus')}>
                            <span className="label">Bus</span>
                        </button>
                    </div>
                </>
            )}

            {step === 'mode' && subModeStep === 'njt' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setSubModeStep(null)} className="back-btn">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 style={{ marginLeft: 16 }}>NJ Transit</h1>
                    </div>
                    <div className="mode-grid">
                        <button className="mode-tile" onClick={() => handleSubModeSelect('njt-rail')}>
                            <span className="label">Train</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleSubModeSelect('njt-bus')}>
                            <span className="label">Bus</span>
                        </button>
                    </div>
                </>
            )}

            {step === 'mode' && subModeStep === 'ferry' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setSubModeStep(null)} className="back-btn">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 style={{ marginLeft: 16 }}>Ferry</h1>
                    </div>
                    <div className="mode-grid">
                        <button className="mode-tile" onClick={() => handleSubModeSelect('nyc-ferry')}>
                            <span className="label">NYC Ferry</span>
                        </button>
                        <button className="mode-tile" onClick={() => handleSubModeSelect('si-ferry')}>
                            <span className="label">Staten Island</span>
                        </button>
                    </div>
                </>
            )}


            {step === 'line' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setStep('mode')} className="back-btn">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 style={{ marginLeft: 16 }}>Select Line</h1>
                    </div>
                    <div className="lines-grid">
                        {LINES.map(l => (
                            <button key={l} className={`line-btn line-${l}`} onClick={() => handleLineSelect(l)}>
                                {l}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {(step === 'station' || step === 'direction') && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => step === 'direction' ? setStep('station') : (mode === 'subway' ? setStep('line') : setStep('mode'))} className="back-btn">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 style={{ marginLeft: 16 }}>
                            {step === 'direction' ? 'Direction' : 'Select Station'}
                        </h1>
                    </div>

                    {step === 'station' && (
                        <StationSelector
                            mode={mode as any}
                            line={line}
                            onSelect={handleStationSelect}
                        />
                    )}

                    {step === 'direction' && (station || mode === 'si-ferry') && (
                        <div className="direction-list">
                            <button className="direction-btn" onClick={() => handleDirectionSelect('N')}>
                                {mode === 'si-ferry' ? 'To Manhattan' : (station?.north_label || 'Northbound')}
                            </button>
                            <button className="direction-btn" onClick={() => handleDirectionSelect('S')}>
                                {mode === 'si-ferry' ? 'To St. George' : (station?.south_label || 'Southbound')}
                            </button>
                        </div>
                    )}
                </>
            )}

            <style jsx>{`
                .mode-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                .mode-tile {
                    height: 80px;
                    background: #2C2C2E;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;
                }
                .mode-tile:active {
                    transform: scale(0.96);
                    background: #3A3A3C;
                }
                .label { font-size: 16px; font-weight: 600; color: white; }


            .lines-grid {
                display: grid;
            grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
            gap: 16px;
                }
            .line-btn {
                width: 60px;
            height: 60px;
            border-radius: 30px;
            font-weight: bold;
            font-size: 20px;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #333;
                }
            /* MTA Colors */
            .line-1, .line-2, .line-3 {background: #EE352E; }
            .line-4, .line-5, .line-6 {background: #00933C; }
            .line-7 {background: #B933AD; }
            .line-A, .line-C, .line-E {background: #0039A6; }
            .line-B, .line-D, .line-F, .line-M {background: #FF6319; }
            .line-N, .line-Q, .line-R, .line-W {background: #FCCC0A; color: black; }
            .line-J, .line-Z {background: #996633; }
            .line-G {background: #6CBE45; }
            .line-L {background: #A7A9AC; color: black; }
            .line-S {background: #808183; }
            .line-SI {background: #0039A6; }

            .back-btn {
                background: none;
            color: white;
            padding: 8px;
            margin-left: -8px;
                }

            .direction-list {
                display: flex;
            flex-direction: column;
            gap: 16px;
                }
            .direction-btn {
                padding: 24px;
            background: #2C2C2E;
            border-radius: 16px;
            color: white;
            font-size: 18px;
            font-weight: 600;
            text-align: left;
                }
            `}</style>
        </main >
    );
}
