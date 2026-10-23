// ============================================================
// Demo veri seti — Firebase yapılandırılana kadar localStorage
// üzerinde tam işlevli çalışır (tarihler bugüne göre dinamik).
// ============================================================
import type { DemoDB } from './types';
import { addDaysISO, todayISO, uid } from './format';

export function buildDemoData(): DemoDB {
  const T = todayISO();
  const d = (n: number) => addDaysISO(T, n);
  const now = Date.now();
  const iso = (minusMin: number) => new Date(now - minusMin * 60000).toISOString();

  const st = {
    mrz: uid(), ytk: uid(), svk: uid(), mn1: uid(), mn2: uid(),
    pak: uid(), td1: uid(), td2: uid(),
  };
  const vh = { fr1: uid(), fr2: uid(), tr1: uid(), ck1: uid(), fr3: uid() };
  const rq = Array.from({ length: 14 }, () => uid());

  const stations = [
    { id: st.mrz, code: 'MRZ', name: 'Merkez Depo', type: 'MERKEZ_DEPO' as const, note: 'Ana hammadde ve malzeme deposu', active: true, createdAt: iso(60 * 24 * 30) },
    { id: st.ytk, code: 'YTK', name: 'Yatak Depo', type: 'YATAK_DEPO' as const, note: 'Mamul yatak stoğu', active: true, createdAt: iso(60 * 24 * 30) },
    { id: st.svk, code: 'SVK', name: 'Sevkiyat Depo', type: 'SEVKIYAT_DEPO' as const, note: 'Müşteri sevkiyat hazırlık alanı', active: true, createdAt: iso(60 * 24 * 30) },
    { id: st.mn1, code: 'MN1', name: 'Montaj İstasyonu 1', type: 'URETIM' as const, note: '', active: true, createdAt: iso(60 * 24 * 29) },
    { id: st.mn2, code: 'MN2', name: 'Montaj İstasyonu 2', type: 'URETIM' as const, note: '', active: true, createdAt: iso(60 * 24 * 29) },
    { id: st.pak, code: 'PAK', name: 'Paketleme İstasyonu', type: 'URETIM' as const, note: '', active: true, createdAt: iso(60 * 24 * 29) },
    { id: st.td1, code: 'TD1', name: 'Dış Tedarikçi — Süngerci', type: 'DIS_TEDARIKCI' as const, note: 'Sünger blok tedariki', active: true, createdAt: iso(60 * 24 * 28) },
    { id: st.td2, code: 'TD2', name: 'Dış Tedarikçi — Kumaş Deposu', type: 'DIS_TEDARIKCI' as const, note: 'Kumaş rulo tedariki', active: true, createdAt: iso(60 * 24 * 28) },
  ];

  const dist = (a: string, b: string, meters: number) =>
    ({ id: [a, b].sort().join('__'), fromId: a, toId: b, meters });
  const distances = [
    dist(st.mrz, st.mn1, 180), dist(st.mrz, st.mn2, 260), dist(st.mrz, st.ytk, 320),
    dist(st.mrz, st.svk, 450), dist(st.mrz, st.pak, 220), dist(st.mrz, st.td1, 900),
    dist(st.mrz, st.td2, 1100), dist(st.ytk, st.pak, 150), dist(st.ytk, st.svk, 380),
    dist(st.ytk, st.td2, 850), dist(st.mn1, st.mn2, 90), dist(st.mn1, st.pak, 120),
    dist(st.mn1, st.svk, 340), dist(st.mn2, st.pak, 170), dist(st.mn2, st.svk, 300),
    dist(st.mn2, st.td1, 780), dist(st.pak, st.svk, 260), dist(st.td1, st.svk, 700),
  ];

  const vehicles = [
    { id: vh.fr1, code: 'FR-01', name: 'Forklift 1', type: 'FORKLIFT' as const, capacityKg: 2000, driver: 'Mehmet K.', status: 'AKTIF' as const, note: '', createdAt: iso(60 * 24 * 25) },
    { id: vh.fr2, code: 'FR-02', name: 'Forklift 2', type: 'FORKLIFT' as const, capacityKg: 2500, driver: 'Ayşe T.', status: 'AKTIF' as const, note: '', createdAt: iso(60 * 24 * 25) },
    { id: vh.tr1, code: 'TR-01', name: 'Transpalet 1', type: 'TRANSPALET' as const, capacityKg: 1200, driver: 'Hasan D.', status: 'AKTIF' as const, note: '', createdAt: iso(60 * 24 * 25) },
    { id: vh.ck1, code: 'CK-01', name: 'Çekici (Trawas)', type: 'CEKICI' as const, capacityKg: 3000, driver: 'Ali V.', status: 'AKTIF' as const, note: 'Rota taşımacılığında kullanılır', createdAt: iso(60 * 24 * 25) },
    { id: vh.fr3, code: 'FR-03', name: 'Forklift 3', type: 'FORKLIFT' as const, capacityKg: 1500, driver: '', status: 'BAKIMDA' as const, note: 'Hidrolik bakım', createdAt: iso(60 * 24 * 20) },
  ];

  const req = (
    i: number, no: string, date: string, requester: string, from: string, to: string,
    material: string, qty: string, priority: 'DUSUK' | 'NORMAL' | 'YUKSEK',
    status: 'BEKLEMEDE' | 'ONAYLANDI' | 'PLANLANDI' | 'TAMAMLANDI' | 'IPTAL', minusMin: number,
  ) => ({
    id: rq[i], no, date, requesterId: requester, fromId: from, toId: to,
    material, qty, priority, status, note: '', createdAt: iso(minusMin), createdBy: 'Demo Yönetici',
  });

  const requests = [
    req(0, 'TKP-0001', d(-5), st.mn1, st.mrz, st.mn1, 'Yatak sacı paketi', '12 palet', 'NORMAL', 'TAMAMLANDI', 60 * 24 * 5),
    req(1, 'TKP-0002', d(-5), st.svk, st.pak, st.svk, 'Paketlenmiş yatak seti', '8 palet', 'NORMAL', 'TAMAMLANDI', 60 * 23 * 5),
    req(2, 'TKP-0003', d(-2), st.mn2, st.td1, st.mn2, 'Sünger blokları', '10 palet', 'YUKSEK', 'TAMAMLANDI', 60 * 24 * 2),
    req(3, 'TKP-0004', d(-2), st.ytk, st.mrz, st.ytk, 'Baza iskeleti', '6 palet', 'NORMAL', 'TAMAMLANDI', 60 * 22 * 2),
    req(4, 'TKP-0005', d(-1), st.pak, st.ytk, st.pak, 'Paketlemeye yatak ürünü', '14 palet', 'NORMAL', 'TAMAMLANDI', 60 * 24),
    req(5, 'TKP-0006', d(-1), st.svk, st.pak, st.svk, 'Sevk edilecek setler', '9 palet', 'NORMAL', 'TAMAMLANDI', 60 * 20),
    req(6, 'TKP-0007', T, st.mn1, st.mrz, st.mn1, 'Kumaş ruloları', '7 rulo', 'NORMAL', 'ONAYLANDI', 60 * 7),
    req(7, 'TKP-0008', T, st.mn2, st.mrz, st.mn2, 'Ahşap kasa (baza)', '5 palet', 'NORMAL', 'ONAYLANDI', 60 * 6),
    req(8, 'TKP-0009', T, st.svk, st.ytk, st.svk, 'Hazır yatak (sevk)', '16 palet', 'YUKSEK', 'PLANLANDI', 60 * 5),
    req(9, 'TKP-0010', T, st.mn2, st.td1, st.mn2, 'Keçe ve kepik', '8 palet', 'NORMAL', 'PLANLANDI', 60 * 5),
    req(10, 'TKP-0011', T, st.pak, st.ytk, st.pak, 'Yatak koruma kılıfı', '4 kutu', 'DUSUK', 'BEKLEMEDE', 60 * 4),
    req(11, 'TKP-0012', T, st.ytk, st.td2, st.ytk, 'Şilte kumaşı', '12 rulo', 'YUKSEK', 'BEKLEMEDE', 60 * 3),
    req(12, 'TKP-0013', T, st.svk, st.mrz, st.svk, 'Aksesuar kutuları', '3 palet', 'DUSUK', 'BEKLEMEDE', 60 * 2),
    req(13, 'TKP-0014', d(-1), st.mn1, st.mrz, st.mn1, 'Metal profil', '6 palet', 'NORMAL', 'IPTAL', 60 * 26),
  ];

  const routes = [
    {
      id: uid(), date: d(-1), vehicleId: vh.ck1, driver: 'Ali V.', start: '08:30',
      startStationId: st.mrz, status: 'TAMAMLANDI' as const,
      stops: [
        { stationId: st.mn1, action: 'BOSALTMA' as const, requestIds: [rq[0]], leg: { loaded: true } },
        { stationId: st.mn2, action: 'BOSALTMA' as const, requestIds: [], leg: { loaded: true } },
        { stationId: st.td1, action: 'YUKLEME' as const, requestIds: [], leg: { loaded: false } },
        { stationId: st.mn2, action: 'BOSALTMA' as const, requestIds: [rq[2]], leg: { loaded: true } },
      ],
      createdAt: iso(60 * 26),
    },
    {
      id: uid(), date: T, vehicleId: vh.ck1, driver: 'Ali V.', start: '08:30',
      startStationId: st.mrz, status: 'ONAYLANDI' as const,
      stops: [
        { stationId: st.mn1, action: 'BOSALTMA' as const, requestIds: [rq[6]], leg: { loaded: true } },
        { stationId: st.mn2, action: 'BOSALTMA' as const, requestIds: [rq[7]], leg: { loaded: true } },
        { stationId: st.td1, action: 'YUKLEME' as const, requestIds: [rq[9]], leg: { loaded: false } },
        { stationId: st.mn2, action: 'BOSALTMA' as const, requestIds: [], leg: { loaded: true } },
        { stationId: st.svk, action: 'BOSALTMA' as const, requestIds: [rq[8]], leg: { loaded: true } },
      ],
      createdAt: iso(60 * 5),
    },
    {
      id: uid(), date: T, vehicleId: vh.tr1, driver: 'Hasan D.', start: '10:00',
      startStationId: st.mrz, status: 'TASLAK' as const,
      stops: [
        { stationId: st.ytk, action: 'BOSALTMA' as const, requestIds: [], leg: { loaded: true } },
        { stationId: st.svk, action: 'BOSALTMA' as const, requestIds: [], leg: { loaded: true } },
        { stationId: st.mrz, action: 'GECIS' as const, requestIds: [], leg: { loaded: false } },
      ],
      createdAt: iso(60 * 3),
    },
  ];

  const shipments = [
    { id: uid(), no: 'SVK-0001', direction: 'GELEN' as const, partner: 'Süngerci A.Ş.', date: d(-1), fromId: st.td1, toId: st.mrz, pallets: 12, qty: 'Sünger blok', plate: '34 ABC 123', status: 'TAMAMLANDI' as const, note: '', createdAt: iso(60 * 30) },
    { id: uid(), no: 'SVK-0002', direction: 'GELEN' as const, partner: 'Kumaş Tekstil Ltd.', date: T, fromId: st.td2, toId: st.ytk, pallets: 8, qty: 'Kumaş rulo', plate: '34 KUM 034', status: 'YOLDA' as const, note: '', createdAt: iso(60 * 8) },
    { id: uid(), no: 'SVK-0003', direction: 'GIDEN' as const, partner: 'Mobilya Mağazaları A.Ş.', date: T, fromId: st.svk, toId: null, pallets: 20, qty: 'Yatak seti', plate: '34 MOB 456', status: 'YOLDA' as const, note: '2 mağazaya parçalı teslim', createdAt: iso(60 * 7) },
    { id: uid(), no: 'SVK-0004', direction: 'GIDEN' as const, partner: 'Anadolu Yatak', date: d(1), fromId: st.svk, toId: null, pallets: 15, qty: 'Yatak', plate: '', status: 'PLANLANDI' as const, note: '', createdAt: iso(60 * 6) },
    { id: uid(), no: 'SVK-0005', direction: 'GELEN' as const, partner: 'Metal Aksesuar San.', date: d(-2), fromId: st.td1, toId: st.mrz, pallets: 6, qty: 'Metal aksesuar', plate: '16 MTL 009', status: 'TAMAMLANDI' as const, note: '', createdAt: iso(60 * 50) },
  ];

  const users = [
    { uid: 'u-demo-admin', email: 'demo@yatsan.local', displayName: 'Demo Yönetici', role: 'admin' as const, createdAt: iso(60 * 24 * 30) },
  ];

  return { users, stations, distances, vehicles, requests, routes, shipments, session: null };
}

/** Demo hesap bilgileri */
export const DEMO_ACCOUNT = { email: 'demo@yatsan.local', password: 'demo123' };
