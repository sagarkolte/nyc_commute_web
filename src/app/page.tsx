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
import { Geolocation } from '@capacitor/geolocation';
import { SplashScreen } from '@capacitor/splash-screen';

export default function Home() {
  const [tuples, setTuples] = useState<CommuteTuple[]>([]);
  const [mounted, setMounted] = useState(false);
  const [sorting, setSorting] = useState(false);

  useEffect(() => {
    const loaded = CommuteStorage.getTuples();
    setTuples(loaded);
    setMounted(true);

    // Force save to heal any legacy data types (e.g. string coords) and sync to widget
    CommuteStorage.saveTuples(loaded);

    // Manual Splash Screen Hide (Better Persistence)
    setTimeout(async () => {
      await SplashScreen.hide();
    }, 2000);

    if (CommuteStorage.getAutoSort()) {
      const doAutoSort = async () => {
        console.log("📍 [AutoSort] Starting...");
        try {
          const perm = await Geolocation.checkPermissions();
          console.log("📍 [AutoSort] Permission Status:", perm.location);

          if (perm.location === 'granted' || perm.location === 'prompt') {
            setSorting(true);
            const position = await Geolocation.getCurrentPosition();
            console.log("📍 [AutoSort] Position:", position.coords.latitude, position.coords.longitude);

            const { latitude, longitude } = position.coords;
            // Feed location to storage so subsequent ETA updates respect this sort
            CommuteStorage.updateLocation(latitude, longitude);
            const sorted = sortTuplesByLocation(loaded, latitude, longitude);

            // Log the ID order to verify sort
            console.log("📍 [AutoSort] Sorted Order:", sorted.map(t => t.id));

            setTuples(sorted);
            CommuteStorage.saveTuples(sorted);
          } else {
            console.warn("📍 [AutoSort] Skipped. Permission:", perm.location);
          }
        } catch (e) {
          console.error("📍 [AutoSort] Failed:", e);
        } finally {
          setSorting(false);
        }
      };
      doAutoSort();
    }
  }, []);

  const handleReorder = (newOrder: CommuteTuple[]) => {
    setTuples(newOrder);
    CommuteStorage.saveTuples(newOrder);
  };

  const handleDelete = (id: string) => {
    CommuteStorage.removeTuple(id);
    setTuples(CommuteStorage.getTuples());
  };

  const handleUpdateTuple = (id: string, updates: Partial<CommuteTuple>) => {
    console.log("📝 [Page] Updating tuple state:", id, updates);

    // 1. Update Storage
    CommuteStorage.updateTuple(id, updates);

    // 2. Update Local State (Immediate UI Refresh)
    setTuples(prev => prev.map(t =>
      t.id === id ? { ...t, ...updates } : t
    ));
  };



  const handleLocationSort = async () => {
    try {
      setSorting(true);

      // Request permissions first
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          alert('Location permission denied.');
          setSorting(false);
          return;
        }
      }

      const position = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const sorted = sortTuplesByLocation(tuples, latitude, longitude);
      setTuples(sorted);
      CommuteStorage.saveTuples(sorted);
      setSorting(false);
    } catch (error) {
      console.error('Error getting location', error);
      alert('Unable to retrieve your location');
      setSorting(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="container">
      <header style={{
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'flex-end', // Align buttons to right since logo is gone
        alignItems: 'center',
        padding: '8px 0'
      }}>
        {/* Branding Removed per User Request */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={handleLocationSort}
            className="icon-btn"
            aria-label="Sort by proximity"
            style={{
              background: '#2C2C2E',
              border: 'none',
              cursor: 'pointer',
              width: 40,
              height: 40,
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <MapPin color={sorting ? "var(--primary)" : "#fff"} size={20} className={sorting ? "animate-pulse" : ""} />
          </button>
          <Link href="/settings" style={{
            background: '#2C2C2E',
            width: 40,
            height: 40,
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <SettingsIcon color="#fff" size={20} />
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
                <SortableCard
                  item={t}
                  onDelete={() => handleDelete(t.id)}
                  onUpdate={(updates) => handleUpdateTuple(t.id, updates)}
                />
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
