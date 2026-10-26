'use client';
// ============================================================
// CANLI HARİTA (Araç Takip) — Leaflet + OpenStreetMap
//   • İstasyonlar: düzenleme modunda haritaya tıklayarak yerleştirilir,
//     yerleştirilenler sürüklenerek taşınır (lat/lng stations koleksiyonuna yazılır)
//   • Araçlar: şoför pinlerinden türetilen konumda kamyon ikonu —
//     istasyondaysa ikon istasyonun üstünde, yoldaysa iki istasyon arası tahmini orta noktada
//   • Aktif rota planları: durak zinciri kesikli çizgiyle çizilir
//   • Popuplar: istasyona tıkla → oradaki araçlar + açık işler;
//     araca tıkla → görev, şoför, son pin
//   Bu bileşen yalnızca tarayıcıda yüklenir (takip.tsx içinde next/dynamic ssr:false).
// ============================================================
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { aracinStasyonu, OPEN_GOREV_DURUMLARI, today } from '@/lib/db';
import { PIN_LABEL } from '@/lib/constants';
import { fmtDT } from '@/lib/format';
import { gorevTalepMi, seferBiten, seferToplam } from '@/lib/types';
import type { Gorev, RoutePlan, Station, UserProfile, Vehicle } from '@/lib/types';

/* Durum renkleri — ekteki renk açıklaması (legend) takip.tsx'te bunlarla uyumlu */
type AracDurum = 'BOSTA' | 'YENI' | 'DOLU_GIDIYOR' | 'BOS_GIDIYOR' | 'DOLU_BEKLIYOR' | 'YUKLEMEDE';

const RENK: Record<AracDurum, string> = {
  BOSTA: '#16a34a',
  YENI: '#dc2626',
  DOLU_GIDIYOR: '#ea580c',
  BOS_GIDIYOR: '#2563eb',
  DOLU_BEKLIYOR: '#ca8a04',
  YUKLEMEDE: '#7c3aed',
};

const DURUM_AD: Record<AracDurum, string> = {
  BOSTA: 'Boşta',
  YENI: 'Yeni görev',
  DOLU_GIDIYOR: 'Dolu gidiyor',
  BOS_GIDIYOR: 'Yolda (boş)',
  DOLU_BEKLIYOR: 'Dolu bekliyor',
  YUKLEMEDE: 'Yükleme istasyonunda',
};

const KISA_DURUM: Record<string, string> = {
  YENI: 'henüz çıkmadı', YOLDA: 'yolda', DONUS_YOLDA: 'boş dönüşte',
  BEKLIYOR: 'indirme bekliyor', ISTATASYONDA: 'istasyonda',
};

const PLAN_RENKLERI = ['#0284c7', '#7c3aed', '#db2777', '#d97706', '#059669', '#4f46e5'];

const TRUCK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

/** Popup/metin HTML kaçışı — istasyon/araç adları kullanıcı verisidir */
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ));

interface AracKonum {
  lat: number;
  lng: number;
  durum: AracDurum;
  /** Hangi istasyonda (yoldaysa null) */
  istId: string | null;
  /** Yolda: iki istasyon arası tahmini orta nokta */
  yoldaMi: boolean;
  g: Gorev | null;
}

export default function TakipHarita({ stations, vehicles, gorevler, routes, users, vardiyaYaz, editMode, pendingIstId, onPlace, onMoved }: {
  stations: Station[];
  vehicles: Vehicle[];
  gorevler: Gorev[];
  routes: RoutePlan[];
  users: (UserProfile & { uid: string })[];
  /** Şoförün vardiya durumu yazısı (bekleme/mola/paydos) — takip.tsx'ten gelir */
  vardiyaYaz: (v: Vehicle) => string;
  editMode: boolean;
  /** Listeden seçilen, haritada yerleştirilecek istasyon */
  pendingIstId: string | null;
  onPlace: (istId: string, lat: number, lng: number) => void;
  onMoved: (istId: string, lat: number, lng: number) => void;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ ist: L.LayerGroup; arac: L.LayerGroup; plan: L.LayerGroup } | null>(null);
  const draggingRef = useRef(false); // marker sürüklenirken katman yeniden kurulmasın
  const didFitRef = useRef(false);
  const onPlaceRef = useRef(onPlace);
  const onMovedRef = useRef(onMoved);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
  useEffect(() => { onMovedRef.current = onMoved; }, [onMoved]);

  const stAdi = (id?: string | null) => {
    const s = stations.find((x) => x.id === id);
    return s ? `${s.code} · ${s.name}` : '—';
  };

  /** Yerleştirilmiş istasyon koordinatları */
  const istKoord = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const s of stations) {
      if (s.lat != null && s.lng != null) m.set(s.id, [s.lat, s.lng]);
    }
    return m;
  }, [stations]);

  /** Her aktif aracın harita konumu — aracinStasyonu + açık görev durumundan türetilir */
  const aracKonum = useMemo(() => {
    const m = new Map<string, AracKonum>();
    for (const v of vehicles) {
      if (v.status !== 'AKTIF') continue;
      const g = gorevler.find((x) => x.vehicleId === v.id && OPEN_GOREV_DURUMLARI.includes(x.durum)) || null;
      const koy = (durum: AracDurum, lat: number, lng: number, istId: string | null, yoldaMi: boolean) =>
        m.set(v.id, { lat, lng, durum, istId, yoldaMi, g });
      if (!g) {
        const ist = aracinStasyonu(v, gorevler); // boşta: son görevin bittiği istasyon / sabit hat başı
        const k = ist ? istKoord.get(ist) : null;
        if (k) koy('BOSTA', k[0], k[1], ist, false);
        continue;
      }
      if (g.durum === 'YENI') {
        const ist = aracinStasyonu(v, gorevler); // YENI: yükleme istasyonunda bekliyor
        const k = ist ? istKoord.get(ist) : null;
        if (k) koy('YENI', k[0], k[1], ist, false);
      } else if (g.durum === 'YOLDA' || g.durum === 'DONUS_YOLDA') {
        const from = g.durum === 'YOLDA' ? g.fromId : g.toId;
        const to = g.durum === 'YOLDA' ? g.toId : g.fromId;
        const f = from ? istKoord.get(from) : null;
        const t = to ? istKoord.get(to) : null;
        const durum: AracDurum = g.durum === 'YOLDA' && g.dolu ? 'DOLU_GIDIYOR' : 'BOS_GIDIYOR';
        if (f && t) koy(durum, (f[0] + t[0]) / 2, (f[1] + t[1]) / 2, null, true);
        else if (f) koy(durum, f[0], f[1], null, true);
        else if (t) koy(durum, t[0], t[1], null, true);
      } else if (g.durum === 'BEKLIYOR') {
        const toId = g.toId || null;
        const k = toId ? istKoord.get(toId) : null;
        if (k && toId) koy('DOLU_BEKLIYOR', k[0], k[1], toId, false);
      } else if (g.durum === 'ISTASYONDA') {
        const ist = (g.tip === 'CAGRI' ? g.toId : g.fromId) || null;
        const k = ist ? istKoord.get(ist) : null;
        if (k && ist) koy('YUKLEMEDE', k[0], k[1], ist, false);
      }
    }
    return m;
  }, [vehicles, gorevler, istKoord]);

  /** İstasyon popupu için: o an istasyonda olan araçlar */
  const buradakiler = useMemo(() => {
    const m = new Map<string, { code: string; renk: string; ad: string }[]>();
    for (const [vId, k] of aracKonum) {
      if (!k.istId || k.yoldaMi) continue;
      const v = vehicles.find((x) => x.id === vId);
      if (!v) continue;
      const arr = m.get(k.istId) || [];
      arr.push({ code: v.code || '?', renk: RENK[k.durum], ad: DURUM_AD[k.durum] });
      m.set(k.istId, arr);
    }
    return m;
  }, [aracKonum, vehicles]);

  /** İstasyon popupu için: bu istasyona ilişkin açık görevler */
  const ilgiliIsler = useMemo(() => {
    const m = new Map<string, string[]>();
    const kod = (id: string) => vehicles.find((x) => x.id === id)?.code || '?';
    for (const g of gorevler) {
      if (!OPEN_GOREV_DURUMLARI.includes(g.durum)) continue;
      const c = kod(g.vehicleId);
      const satir = `${c} · ${g.tip === 'CAGRI' ? `${stAdi(g.toId)} çağrısı` : `${stAdi(g.fromId)} → ${stAdi(g.toId)}`} (${KISA_DURUM[g.durum] || g.durum})`;
      for (const ist of [g.fromId, g.toId]) {
        if (!ist) continue;
        const arr = m.get(ist) || [];
        if (!arr.includes(satir)) arr.push(satir);
        m.set(ist, arr);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorevler, vehicles, stations]);

  /** Aktif rota planları: durak zinciri, koordinatı eksik duraklarda çizgi kesilir */
  const aktifPlanlar = useMemo(() => {
    const out: { no?: string; vCode: string; renk: string; segments: [number, number][][]; zincir: string }[] = [];
    const open = routes
      .filter((r) => r.status !== 'TAMAMLANDI' && !!r.date && r.date <= today())
      .sort((a, b) => (a.no || '').localeCompare(b.no || '', 'tr'));
    open.forEach((r, i) => {
      const zincirIds = [r.startStationId, ...(r.stops || []).map((s) => s.stationId)]
        .filter((id): id is string => !!id)
        .filter((id, j, arr) => j === 0 || id !== arr[j - 1]);
      if (zincirIds.length < 2) return;
      const v = vehicles.find((x) => x.id === r.vehicleId);
      const pts = zincirIds.map((id) => istKoord.get(id) || null);
      const segments: [number, number][][] = [];
      let cur: [number, number][] = [];
      for (const p of pts) {
        if (p) cur.push(p);
        else { if (cur.length > 1) segments.push(cur); cur = []; }
      }
      if (cur.length > 1) segments.push(cur);
      if (segments.length) {
        out.push({
          no: r.no, vCode: v?.code || '?', renk: PLAN_RENKLERI[i % PLAN_RENKLERI.length],
          segments, zincir: zincirIds.map((id) => stAdi(id)).join(' → '),
        });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, istKoord, vehicles, stations]);

  /* ---- Popup HTML kurucuları ---- */
  const aracPopupHtml = (v: Vehicle, k: AracKonum): string => {
    const sofor = users.find((u) => u.role === 'sofor' && u.vehicleId === v.id)?.displayName;
    const g = k.g;
    const seferli = g ? !!(gorevTalepMi(g) || g.cagriSefer === true) : false;
    const lastPin = g?.pins?.[g.pins.length - 1];
    const rows: string[] = [];
    rows.push(`<div style="font-size:13.5px;font-weight:800">${esc(v.code)}${v.name ? ` <span style="font-weight:500;color:#64748b">${esc(v.name)}</span>` : ''}</div>`);
    rows.push(`<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${RENK[k.durum]};margin-right:5px"></span><b>${DURUM_AD[k.durum]}</b>${sofor ? ` · Şoför: ${esc(sofor)}` : ' · Şoför ataması yok'}</div>`);
    if (g) {
      rows.push(`<div style="margin-top:4px">${esc(stAdi(g.fromId))} → <b>${esc(stAdi(g.toId))}</b>${seferli ? ` · Sefer ${Math.min(seferBiten(g) + 1, seferToplam(g))}/${seferToplam(g)}` : ''}</div>`);
      if (lastPin) rows.push(`<div style="color:#64748b">Son pin: ${esc(PIN_LABEL[lastPin.tip] || lastPin.tip)} · ${fmtDT(lastPin.at)}</div>`);
    }
    const vardiya = vardiyaYaz(v);
    if (vardiya) rows.push(`<div style="color:#92400e;font-weight:700">${esc(vardiya)}</div>`);
    if (k.yoldaMi) rows.push(`<div style="color:#64748b;font-size:11px">Konum tahmini — iki istasyon arası orta nokta (GPS yok, pinden türetilir)</div>`);
    return rows.join('');
  };

  const istPopupHtml = (s: Station): string => {
    const burada = buradakiler.get(s.id) || [];
    const isler = ilgiliIsler.get(s.id) || [];
    const rows: string[] = [];
    rows.push(`<div style="font-size:13.5px;font-weight:800">${esc(s.code)} · ${esc(s.name)}</div>`);
    rows.push(`<div style="margin-top:5px"><b>Buradaki araçlar</b> (${burada.length})`);
    rows.push(burada.length
      ? `<div style="margin:3px 0 0">${burada.map((b) =>
          `<div style="margin:2px 0"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${b.renk};margin-right:5px"></span><b>${esc(b.code)}</b> — ${esc(b.ad)}</div>`
        ).join('')}</div>`
      : '<div style="color:#64748b"> —</div>');
    rows.push(`</div><div style="margin-top:5px"><b>Bu istasyonun açık işleri</b> (${isler.length})`);
    rows.push(isler.length
      ? `<div style="margin:3px 0 0;color:#334155">${isler.map((x) => `<div style="margin:2px 0">• ${esc(x)}</div>`).join('')}</div>`
      : '<div style="color:#64748b"> —</div>');
    rows.push('</div>');
    return rows.join('');
  };

  /* ---- Marker ikonları (divIcon — resim dosyası yok, paketleyici dostu) ---- */
  const istIco = (code: string): L.DivIcon =>
    L.divIcon({
      className: 'yts-ist-ico',
      html: `<div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1d4ed8,#1e40af);border:2.5px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px;letter-spacing:.2px">${esc(code)}</div>`,
      iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
    });

  const aracIco = (renk: string): L.DivIcon =>
    L.divIcon({
      className: 'yts-arac-ico',
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${renk};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center">${TRUCK_SVG}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14],
    });

  /* ---- Harita kurulumu (bir kez) ---- */
  useEffect(() => {
    const el = divRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true });
    map.setView([39.6, 34.9], 5); // yerleşim yapılınca fitBounds düzeltir
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları',
    }).addTo(map);
    layersRef.current = {
      ist: L.layerGroup().addTo(map),
      arac: L.layerGroup().addTo(map),
      plan: L.layerGroup().addTo(map),
    };
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; };
  }, []);

  /* ---- İstasyon markerları — düzenleme modunda sürüklenebilir ---- */
  useEffect(() => {
    const map = mapRef.current;
    const lg = layersRef.current?.ist;
    if (!map || !lg || draggingRef.current) return;
    lg.clearLayers();
    for (const s of stations) {
      if (s.lat == null || s.lng == null) continue;
      const m = L.marker([s.lat, s.lng], { icon: istIco(s.code), draggable: editMode, zIndexOffset: editMode ? 1000 : 0 })
        .addTo(lg);
      m.bindPopup(istPopupHtml(s), { maxWidth: 280 });
      m.bindTooltip(`${s.code} · ${s.name}`, { direction: 'bottom', offset: [0, 14], className: 'yts-lbl' });
      if (editMode) {
        m.on('dragstart', () => { draggingRef.current = true; });
        m.on('dragend', () => {
          draggingRef.current = false;
          const ll = m.getLatLng();
          onMovedRef.current(s.id, ll.lat, ll.lng);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, editMode, buradakiler, ilgiliIsler]);

  /* ---- Araç markerları ---- */
  useEffect(() => {
    const lg = layersRef.current?.arac;
    if (!lg || draggingRef.current) return;
    lg.clearLayers();
    for (const [vId, k] of aracKonum) {
      const v = vehicles.find((x) => x.id === vId);
      if (!v) continue;
      const m = L.marker([k.lat, k.lng], { icon: aracIco(RENK[k.durum]), zIndexOffset: 500 }).addTo(lg);
      m.bindPopup(aracPopupHtml(v, k), { maxWidth: 280 });
      m.bindTooltip(v.code || '?', { permanent: true, direction: 'bottom', offset: [0, 13], className: 'yts-lbl' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aracKonum, vehicles, users]);

  /* ---- Rota planı kesikli çizgileri ---- */
  useEffect(() => {
    const lg = layersRef.current?.plan;
    if (!lg) return;
    lg.clearLayers();
    for (const p of aktifPlanlar) {
      for (const seg of p.segments) {
        const pl = L.polyline(seg, { color: p.renk, weight: 3.5, opacity: .8, dashArray: '8 8' }).addTo(lg);
        pl.bindPopup(
          `<b>Rota planı ${esc(p.no || '')}</b> · ${esc(p.vCode)}<div style="color:#475569;margin-top:3px">${esc(p.zincir)}</div>`,
          { maxWidth: 320 },
        );
      }
    }
  }, [aktifPlanlar]);

  /* ---- İlk yerleşimde haritayı istasyonlara sığdır ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFitRef.current) return;
    const pts = stations
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => [s.lat as number, s.lng as number] as [number, number]);
    if (!pts.length) return;
    didFitRef.current = true;
    if (pts.length === 1) map.setView(pts[0], 16);
    else map.fitBounds(L.latLngBounds(pts).pad(0.3));
  }, [stations]);

  /* ---- Yerleştirme modu: listeden seçilen istasyon için harita tıklaması ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const el = map.getContainer();
    if (!pendingIstId) { el.classList.remove('yts-pick'); return; }
    el.classList.add('yts-pick');
    const h = (e: L.LeafletMouseEvent) => onPlaceRef.current(pendingIstId, e.latlng.lat, e.latlng.lng);
    map.on('click', h);
    return () => { map.off('click', h); el.classList.remove('yts-pick'); };
  }, [pendingIstId]);

  return (
    <>
      <style>{`
        .yts-ist-ico, .yts-arac-ico { background: transparent; border: none; }
        .yts-lbl { background: rgba(255,255,255,.88); border: none; box-shadow: 0 0 0 2px rgba(255,255,255,.55); color: #0f172a; font-weight: 700; font-size: 10.5px; padding: 1px 6px; border-radius: 7px; }
        .yts-lbl::before { display: none; }
        .yts-pick, .yts-pick .leaflet-grab, .yts-pick .leaflet-interactive { cursor: crosshair !important; }
        .leaflet-popup-content-wrapper { border-radius: 12px; }
        .leaflet-popup-content { margin: 10px 13px; font-size: 12.5px; line-height: 1.5; }
      `}</style>
      <div ref={divRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
