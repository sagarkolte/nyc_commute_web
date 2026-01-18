"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Settings as SettingsIcon, MapPin } from 'lucide-react';
import { CommuteTuple } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { CountdownCard } from '@/components/CountdownCard';
import { SortableCard } from '@/components/SortableCard';
import { Reorder, motion } from 'framer-motion';
import { sortTuplesByLocation } from '@/lib/location';

export default function Home() {
  const [tuples, setTuples] = useState<CommuteTuple[]>([]);
  const [mounted, setMounted] = useState(false);
  const [sorting, setSorting] = useState(false);

  useEffect(() => {
    setTuples(CommuteStorage.getTuples());
    setMounted(true);
  }, []);

  const handleReorder = (newOrder: CommuteTuple[]) => {
    setTuples(newOrder);
    CommuteStorage.saveTuples(newOrder);
  };

  const handleDelete = (id: string) => {
    CommuteStorage.removeTuple(id);
    setTuples(CommuteStorage.getTuples());
  };

  const handleLocationSort = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setSorting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // console.log("Sorting for", latitude, longitude);
        const sorted = sortTuplesByLocation(tuples, latitude, longitude);
        setTuples(sorted);
        CommuteStorage.saveTuples(sorted);
        setSorting(false);
        // Optional: Provide feedback?
      },
      (error) => {
        console.error('Error getting location', error);
        alert('Unable to retrieve your location');
        setSorting(false);
      }
    );
  };

  if (!mounted) return null;

  return (
    <main className="container">
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/logo.png" width={32} height={32} alt="Transit Pulse" style={{ borderRadius: 8 }} />
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Transit Pulse</h1>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={handleLocationSort}
            className="icon-btn"
            aria-label="Sort by proximity"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <MapPin color={sorting ? "var(--primary)" : "#888"} size={24} className={sorting ? "animate-pulse" : ""} />
          </button>
          <Link href="/settings">
            <SettingsIcon color="#888" size={24} />
          </Link>
        </div>
      </header>

      {tuples.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 100, color: '#666' }}>
          <p>No routes added yet.</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={tuples} onReorder={handleReorder}>
          {tuples.map(t => {
            // DEBUG: Calculate distance if we have location
            // Note: We need user location state to show this live, 
            // but for now let's just show if it HAS coords.
            // Better: add a text showing the coords.
            // Better: add a text showing the coords.

            return (
              <div key={t.id} style={{ position: 'relative' }}>
                <SortableCard item={t} onDelete={() => handleDelete(t.id)} />
                {/* Debug Overlay */}
                <div style={{ position: 'absolute', top: 0, right: 50, fontSize: 10, color: 'lime', background: 'rgba(0,0,0,0.7)', padding: 2, zIndex: 100 }}>
                  {t.lat ? `Saved: ${Number(t.lat).toFixed(3)}, ${Number(t.lon).toFixed(3)}` : `Static: ${t.mode}`}
                </div>
              </div>
            );
          })}
        </Reorder.Group>
      )}

      <Link href="/add" className="add-fab">
        <Plus color="white" size={32} />
      </Link>

      <style jsx global>{`
        .icon-btn:active { opacity: 0.7; transform: scale(0.95); }
        .animate-pulse { animation: pulse 1s infinite; }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
      `}</style>
    </main>
  );
}
