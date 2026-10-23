// ============================================================
// Biçimlendirme ve tarih yardımcıları
// ============================================================

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = iso.length <= 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDT(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtKm(meters?: number | null): string {
  if (meters == null || isNaN(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} km`;
}

export function fmtNum(n?: number | null): string {
  return (n ?? 0).toLocaleString('tr-TR');
}

export function todayISO(d: Date = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

export function matchText(hay: unknown, needle: string): boolean {
  return !needle || String(hay ?? '').toLocaleLowerCase('tr').includes(needle.toLocaleLowerCase('tr'));
}

/** Türkçe büyük harf (i → İ) */
export function upperTr(s: string): string {
  return s.toLocaleUpperCase('tr');
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
