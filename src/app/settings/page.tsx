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
                <Link href="/" className="back-link">
                    <ArrowLeft color="white" />
                </Link>
                <h1>Settings</h1>
            </div>

            <div className="card">
                <h2>MTA Bus Time API Key</h2>
                <p className="desc">
                    Required for real-time Bus tracking.
                    <a href="http://bustime.mta.info/wiki/Developers/Index" target="_blank" rel="noreferrer"> Get a key here.</a>
                </p>

                <input
                    type="text"
                    placeholder="Enter your API Key"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    className="input"
                />

                <button onClick={handleSave} className="save-btn">
                    {saved ? 'Saved!' : 'Save Key'}
                </button>
            </div>

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
                        // We can't await saveTuples because it's void, but it logs to console.
                        // Let's call the bridge directly to prove connectivity
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
      `}</style>
        </main>
    );
}
