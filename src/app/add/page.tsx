"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommuteTuple, Station, CommuteDirection } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { StationSelector } from '@/components/StationSelector';
import Link from 'next/link';

const LINES = [
    '1', '2', '3', '4', '5', '6', '7',
    'A', 'C', 'E', 'B', 'D', 'F', 'M',
    'N', 'Q', 'R', 'W', 'J', 'Z', 'G', 'L', 'S'
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
            saveTuple(s, (s.direction as any) || 'N', routeId);
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
            createdAt: Date.now()
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
            } else {
                newTuple.label = `${s.name} - ${dir === 'N' ? 'NYC Bound' : 'NJ/Outbound'}`;
                if (mode === 'lirr' || mode === 'mnr') {
                    newTuple.label = `${s.name} - ${dir === 'N' ? 'Westbound' : 'Eastbound'}`;
                }
            }
        } else if (mode === 'bus') {
            newTuple.label = `${s.name} - ${dir}`;
        } else {
            newTuple.label = `${s.name} to ${dir === 'N' ? (s.north_label || 'North') : (s.south_label || 'South')}`;
        }

        CommuteStorage.addTuple(newTuple);
        router.push('/');
    };

    const handleDirectionSelect = (dir: 'N' | 'S') => {
        if (!station) return;
        saveTuple(station, dir);
    };

    return (
        <main className="container">
            {step === 'mode' && !subModeStep && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <Link href="/" style={{ color: 'var(--primary)', marginRight: 16 }}>Cancel</Link>
                        <h1>Select Mode</h1>
                    </div>
                    <div className="grid">
                        <button className="mode-btn" onClick={() => handleModeSelect('subway')}>Subway</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('lirr')}>LIRR</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('mnr')}>Metro-North</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('njt')}>NJ Transit</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('path')}>PATH</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('ferry')}>Ferry</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('bus')}>Bus</button>
                    </div>
                </>
            )}

            {step === 'mode' && subModeStep === 'njt' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setSubModeStep(null)} className="back-btn">← Back</button>
                        <h1>NJ Transit Mode</h1>
                    </div>
                    <div className="grid">
                        <button className="mode-btn" onClick={() => handleSubModeSelect('njt-rail')}>Train</button>
                        <button className="mode-btn" onClick={() => handleSubModeSelect('njt-bus')}>Bus</button>
                    </div>
                </>
            )}

            {step === 'mode' && subModeStep === 'ferry' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setSubModeStep(null)} className="back-btn">← Back</button>
                        <h1>Ferry Mode</h1>
                    </div>
                    <div className="grid">
                        <button className="mode-btn" onClick={() => handleSubModeSelect('nyc-ferry')}>NYC Ferry - Real Time</button>
                        <button className="mode-btn" onClick={() => handleSubModeSelect('si-ferry')}>Staten Island Ferry - Schedule Only</button>
                    </div>
                </>
            )}


            {step === 'line' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <button onClick={() => setStep('mode')} className="back-btn">← Back</button>
                        <h1>Select Line</h1>
                    </div>
                    <div className="grid">
                        {LINES.map(l => (
                            <button key={l} className="line-btn" onClick={() => handleLineSelect(l)}>
                                {l}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {step === 'station' && (
                <StationSelector
                    mode={mode as any}
                    line={line}
                    onSelect={handleStationSelect}
                    onBack={() => setStep(mode === 'subway' ? 'line' : 'mode')}
                />
            )}

            {step === 'direction' && station && (
                <div className="direction-step">
                    <button className="back-btn" onClick={() => setStep('station')}>← Back</button>
                    <h2>Select Direction</h2>
                    <p style={{ color: '#888', marginBottom: 32 }}>{station.name}</p>

                    <button className="dir-btn" onClick={() => handleDirectionSelect('N')}>
                        {mode === 'lirr' || mode === 'mnr' ? 'Toward NYC / Westbound' : (mode === 'path' ? 'Toward NYC (33rd St / WTC)' : (mode === 'si-ferry' ? 'To Manhattan' : `Toward ${station?.north_label || 'Uptown / Northbound'}`))}
                    </button>

                    <button className="dir-btn" onClick={() => handleDirectionSelect('S')}>
                        {mode === 'lirr' || mode === 'mnr' ? 'Toward LI/CT / Eastbound' : (mode === 'path' ? 'Toward NJ (Newark / Hoboken)' : (mode === 'si-ferry' ? 'To Staten Island' : `Toward ${station?.south_label || 'Downtown / Southbound'}`))}
                    </button>
                </div>
            )}

            <style jsx>{`
        .grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
        .line-btn {
          width: 60px; height: 60px;
          border-radius: 50%;
          background: #333;
          color: white;
          font-weight: bold;
          font-size: 24px;
        }
        .mode-btn {
            background: var(--card-bg);
            padding: 24px;
            border-radius: 12px;
            color: white;
            font-size: 20px;
            width: 100%;
            text-align: center;
            font-weight: bold;
        }
        .direction-step { display: flex; flex-direction: column; }
        .back-btn { background: none; color: var(--primary); text-align: left; padding: 0; margin-right: 16px; font-size: 16px; }
        .dir-btn {
          background: var(--card-bg);
          padding: 20px;
          border-radius: 12px;
          color: white;
          font-size: 18px;
          margin-bottom: 16px;
          text-align: left;
        }
      `}</style>
        </main>
    );
}
