"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Settings as SettingsIcon, TrainFront, Activity } from 'lucide-react';
import { CommuteTuple } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { CountdownCard } from '@/components/CountdownCard';

export default function Home() {
  const [tuples, setTuples] = useState<CommuteTuple[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTuples(CommuteStorage.getTuples());
    setMounted(true);
  }, []);

  const handleDelete = (id: string) => {
    if (confirm('Delete this route?')) {
      CommuteStorage.removeTuple(id);
      setTuples(CommuteStorage.getTuples());
    }
  };

  if (!mounted) return null;

  return (
    <main className="container">
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/logo.png" width={32} height={32} alt="Transit Pulse" style={{ borderRadius: 8 }} />
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Transit Pulse</h1>
        </div>
        <Link href="/settings">
          <SettingsIcon color="#888" size={24} />
        </Link>
      </header>

      {tuples.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 100, color: '#666' }}>
          <p>No routes added yet.</p>
        </div>
      ) : (
        tuples.map(t => (
          <CountdownCard key={t.id} tuple={t} onDelete={() => handleDelete(t.id)} />
        ))
      )}

      <Link href="/add" className="fab">
        <Plus color="white" size={32} />
      </Link>

      <style jsx>{`
        .fab {
          position: fixed;
          bottom: 32px;
          right: 24px;
          width: 56px; height: 56px;
          border-radius: 28px;
          background: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
      `}</style>
    </main>
  );
}
