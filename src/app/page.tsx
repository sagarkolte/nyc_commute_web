"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import { CommuteTuple } from '@/types';
import { CommuteStorage } from '@/lib/storage';
import { CountdownCard } from '@/components/CountdownCard';
import { Reorder, motion } from 'framer-motion';

export default function Home() {
  const [tuples, setTuples] = useState<CommuteTuple[]>([]);
  const [mounted, setMounted] = useState(false);

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
        <Reorder.Group axis="y" values={tuples} onReorder={handleReorder}>
          {tuples.map(t => (
            <Reorder.Item
              key={t.id}
              value={t}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileDrag={{ scale: 1.05, boxShadow: "0 8px 20px rgba(0,0,0,0.2)" }}
            >
              <CountdownCard tuple={t} onDelete={() => handleDelete(t.id)} />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      <Link href="/add" className="add-fab">
        <Plus color="white" size={32} />
      </Link>


    </main>
  );
}
