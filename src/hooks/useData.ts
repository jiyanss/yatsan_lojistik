'use client';
// ============================================================
// React hook'ları: canlı koleksiyon dinleme + hash yönlendirme
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { watch } from '@/lib/db';
import type { ColName, DemoDB } from '@/lib/types';

/** Koleksiyonu canlı dinler; bileşenUnmount olunca dinleme kapanır. */
export function useCollection<C extends ColName>(col: C | null): DemoDB[C] | null {
  const [rowsByCol, setRowsByCol] = useState<Partial<Record<string, unknown>>>({});

  useEffect(() => {
    if (!col) return;
    const un = watch(col, (data) => setRowsByCol((prev) => ({ ...prev, [col]: data })));
    return () => { try { un(); } catch { /* yoksay */ } };
  }, [col]);

  return (col ? (rowsByCol[col] as DemoDB[C] | undefined) ?? null : null);
}

/**
 * Birden çok koleksiyonu aynı anda dinler (sayfa başlangıcı için).
 * Anahtar string'e çevrilir ki effect yalnızca küme değişince çalışsın.
 */
export function useCollections(cols: ColName[]): Record<string, unknown> | null {
  const key = cols.join('|');
  const [state, setState] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const list = key.split('|').filter(Boolean) as ColName[];
    let alive = true;
    const acc: Record<string, unknown> = {};
    const uns = list.map((col) =>
      watch(col, (rows) => {
        if (!alive) return;
        acc[col] = rows;
        setState({ ...acc });
      }));
    return () => {
      alive = false;
      uns.forEach((u) => { try { u(); } catch { /* yoksay */ } });
    };
  }, [key]);

  return state;
}

/** Hash tabanlı yönlendirme (#/ozet gibi) — statik deploy uyumlu */
export function useHashRoute(): [string, (h: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'ozet';
  const [route, setRoute] = useState<string>(() => (typeof window === 'undefined' ? 'ozet' : read()));

  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((h: string) => { window.location.hash = '#/' + h.replace(/^#?\/?/, ''); }, []);
  return [route, navigate];
}

/** Arama kutuları için gecikmeli değer */
export function useDebounced<T>(value: T, ms = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
