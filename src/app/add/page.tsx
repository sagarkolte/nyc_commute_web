"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommuteTuple, Station } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { StationSelector } from '@/components/StationSelector';
import Link from 'next/link';

const LINES = [
    '1', '2', '3', '4', '5', '6', '7',
    'A', 'C', 'E', 'B', 'D', 'F', 'M',
    'N', 'Q', 'R', 'W', 'J', 'Z', 'G', 'L', 'S'
];

type Step = 'mode' | 'line' | 'station' | 'direction';

export default function AddPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('mode');
    const [mode, setMode] = useState<CommuteTuple['mode'] | 'lirr' | 'mnr' | 'path'>('subway');
    const [line, setLine] = useState('');
    const [station, setStation] = useState<Station | null>(null);

    const handleModeSelect = (m: 'subway' | 'bus' | 'lirr' | 'mnr' | 'path') => {
        setMode(m);
        if (m === 'subway') setStep('line');
        else if (m === 'lirr') {
            setLine('LIRR'); // Pseudo-line for LIRR
            setStep('station');
        } else if (m === 'mnr') {
            setLine('MNR'); // Pseudo-line for MNR
            setStep('station');
        } else if (m === 'path') {
            setLine('PATH');
            setStep('station');
        }
        else setStep('station'); // Bus
    };

    const handleLineSelect = (l: string) => {
        setLine(l);
        setStep('station');
    };

    const handleStationSelect = (s: Station, routeId?: string, destStation?: Station) => {
        setStation(s);
        // For Bus, the station already implies direction (it's a specific stop)
        if (mode === 'bus') {
            // Bus directions can be N, S, E, W, but also NE, NW, SE, SW.
            // For the app's CommuteDirection type, we might want to keep robust types.
            // But let's just pass what we have; checking strict types might be needed.
            // We'll cast to any to be safe for now, as direction is just a label for Bus in our usage.
            saveTuple(s, (s.direction as any) || 'N', routeId);
        } else if (mode === 'mnr' && destStation) {
            // Metro-North: Origin -> Destination flow (skip direction step)
            // We use 'N' as a placeholder direction, but the filtering will use destId.
            saveTuple(s, 'N', undefined, destStation);
        } else {
            setStep('direction');
        }
    };

    const saveTuple = (s: Station, dir: 'N' | 'S' | 'E' | 'W', specificRouteId?: string, destStation?: Station) => {
        const newTuple: CommuteTuple = {
            id: Date.now().toString(),
            label: `${s.name} (${mode})`,
            mode: (mode === 'lirr' || mode === 'mnr' || mode === 'path') ? 'rail' : mode as any,
            routeId: specificRouteId || line,
            stopId: s.id,
            direction: dir,
            destinationName: s.headsign, // For Bus
            destinationStopId: destStation?.id, // For MNR
            createdAt: Date.now()
        };

        if (mode === 'lirr' || mode === 'mnr' || mode === 'path') {
            if (destStation) {
                newTuple.label = `${s.name} ➔ ${destStation.name}`;
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
            {step === 'mode' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                        <Link href="/" style={{ color: 'var(--primary)', marginRight: 16 }}>Cancel</Link>
                        <h1>Select Mode</h1>
                    </div>
                    <div className="grid">
                        <button className="mode-btn" onClick={() => handleModeSelect('subway')}>Subway</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('lirr')}>LIRR</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('mnr')}>Metro-North</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('path')}>PATH</button>
                        <button className="mode-btn" onClick={() => handleModeSelect('bus')}>Bus</button>
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
                        {mode === 'lirr' || mode === 'mnr' ? 'Toward NYC / Westbound' : (mode === 'path' ? 'Toward NYC (33rd St / WTC)' : `Toward ${station.north_label || 'Uptown / Northbound'}`)}
                    </button>

                    <button className="dir-btn" onClick={() => handleDirectionSelect('S')}>
                        {mode === 'lirr' || mode === 'mnr' ? 'Toward LI/CT / Eastbound' : (mode === 'path' ? 'Toward NJ (Newark / Hoboken)' : `Toward ${station.south_label || 'Downtown / Southbound'}`)}
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
