"use client";

import { useState, useEffect } from 'react';
import { CommuteStorage } from '@/lib/storage';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
    const [key, setKey] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = CommuteStorage.getApiKey();
        if (stored) setKey(stored);
    }, []);

    const handleSave = () => {
        CommuteStorage.setApiKey(key.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <main className="container">
            <div className="header">
                <Link href="/" style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: '#2C2C2E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <ArrowLeft color="white" size={20} />
                </Link>
                <h1>Settings</h1>
            </div>

            {/* Auto-Sort Toggle */}
            <div className="card" style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2>Auto-Sort by Location</h2>
                        <p className="desc" style={{ marginBottom: 0 }}>
                            Automatically rearrange cards based on your current location when the app opens.
                        </p>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={CommuteStorage.getAutoSort()}
                            onChange={(e) => {
                                CommuteStorage.setAutoSort(e.target.checked);
                                window.location.reload();
                            }}
                        />
                        <span className="slider round"></span>
                    </label>
                </div>
            </div>

            {/* Widget Debug Card */}
            <div className="card" style={{ marginTop: 24 }}>
                <h2>Widget Debug</h2>
                <p className="desc">
                    Force a sync to the iOS Widget.
                </p>
                <button onClick={() => {
                    alert('Starting Sync...');
                    try {
                        const tuples = CommuteStorage.getTuples();
                        CommuteStorage.saveTuples(tuples);
                        import('../../lib/widget_bridge').then(async m => {
                            try {
                                await m.default.echo({ value: 'Debug Echo' });
                                alert('Sync Triggered + Echo Success!');
                            } catch (e: any) {
                                alert('Echo Failed: ' + e.message);
                            }
                        }).catch(err => alert('Import Failed: ' + err.message));
                    } catch (e: any) {
                        alert('Sync Failed: ' + e.message);
                    }
                }} className="save-btn" style={{ backgroundColor: '#444' }}>
                    Force Widget Sync
                </button>
            </div>

            {/* Troubleshoot Card */}
            <div className="card" style={{ marginTop: 24 }}>
                <h2>Troubleshoot</h2>
                <p className="desc">
                    If auto-sort isn't working for older routes, try repairing the data.
                </p>
                <button onClick={() => {
                    import('../../lib/storage').then(async ({ CommuteStorage }) => {
                        const tuples = CommuteStorage.getTuples();
                        let updatedCount = 0;

                        try {
                            const [njt, lirr, mnr] = await Promise.all([
                                import('../../lib/njt_stations.json').then(m => m.default),
                                import('../../lib/lirr_stations.json').then(m => m.default),
                                import('../../lib/mnr_stations.json').then(m => m.default),
                            ]);

                            const allStations = [...njt, ...lirr, ...mnr] as any[];

                            const fixed = tuples.map(t => {
                                // If missing lat/lon, try to find it
                                if (t.lat === undefined || t.lon === undefined || t.lat === null || t.lon === null) {
                                    // Try find by stopId or name
                                    const match = allStations.find(s => s.id === t.stopId || s.name === t.label.split('(')[0].trim());
                                    if (match && match.lat && match.lon) {
                                        updatedCount++;
                                        return { ...t, lat: Number(match.lat), lon: Number(match.lon) };
                                    }
                                }
                                return t;
                            });

                            if (updatedCount > 0) {
                                CommuteStorage.saveTuples(fixed);
                                alert(`Repaired ${updatedCount} routes with missing location data!`);
                                setTimeout(() => window.location.reload(), 500);
                            } else {
                                alert('No routes needed repair.');
                            }
                        } catch (e: any) {
                            alert('Repair failed: ' + e.message);
                        }
                    });
                }} className="save-btn" style={{ backgroundColor: '#2C2C2E', marginTop: 8 }}>
                    Repair Missing Coordinates
                </button>
            </div>

            <style jsx>{`
        .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .back-link { display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 50%; background: #333; }
        .card { background: var(--card-bg); padding: 24px; border-radius: 16px; }
        h2 { margin-top: 0; font-size: 18px; margin-bottom: 8px; }
        .desc { color: #aaa; margin-bottom: 16px; font-size: 14px; line-height: 1.4; }
        .desc a { color: var(--primary); text-decoration: underline; }
        .input {
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid var(--border);
            background: #222;
            color: white;
            font-size: 16px;
            margin-bottom: 16px;
        }
        .save-btn {
            width: 100%;
            padding: 14px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
        }
        .switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 28px;
          flex-shrink: 0;
          margin-left: 16px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #555;
          transition: .4s;
          border-radius: 28px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 22px;
          width: 22px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: var(--primary);
        }
        input:checked + .slider:before {
          transform: translateX(22px);
        }
      `}</style>
        </main>
    );
}
