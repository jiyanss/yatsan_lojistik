// ============================================================
// Veri katmanı — iki mod:
//   • firebase: gerçek Firebase Auth + Firestore (npm SDK)
//   • demo    : Firebase girilmediyse localStorage üzerinde tam işlev
// Tüm görünümler yalnızca bu modülü kullanır.
// ============================================================
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updateProfile,
} from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs,
  onSnapshot, query, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore';
import { ensureFirebase, getFirebaseConfig, isFirebaseConfigured, type FbContext } from './firebase';
import { buildDemoData } from './demo-data';
import { uid, todayISO } from './format';
import type {
  ColName, DemoDB, Distance, Gorev, GorevDurum, GorevPin, GorevTip, PinTip, Role,
  RoutePlan, RouteTotals, Shipment, Station, TransportRequest, UserProfile, Vehicle,
} from './types';

export const COLS: ColName[] = ['users', 'stations', 'distances', 'vehicles', 'requests', 'routes', 'shipments', 'gorevler'];
const DEMO_KEY = 'yatsan_il_db_v1';

type Mode = 'demo' | 'firebase';
let mode: Mode = isFirebaseConfigured() ? 'firebase' : 'demo';
let fb: FbContext | null = null;
let demo: DemoDB | null = null;
let currentUser: UserProfile | null = null;

type AuthCb = (u: UserProfile | null) => void;
const authCbs = new Set<AuthCb>();
const dataCbs: Partial<Record<ColName, Set<(rows: unknown[]) => void>>> = {};

/* ---------------- yardımcılar ---------------- */
function emitAuth(user: UserProfile | null) {
  currentUser = user;
  authCbs.forEach((cb) => { try { cb(user); } catch (e) { console.error(e); } });
}

function demoRows<C extends ColName>(col: C): DemoDB[C] {
  return (demo?.[col] ?? []) as DemoDB[C];
}

function emitCol(col: ColName) {
  const set = dataCbs[col];
  if (!set || !demo) return;
  set.forEach((cb) => { try { cb(demoRows(col).map((x) => ({ ...x }))); } catch (e) { console.error(e); } });
}

function loadDemo() {
  try { demo = JSON.parse(localStorage.getItem(DEMO_KEY) || ''); } catch { demo = null; }
  if (!demo || typeof demo !== 'object' || !Array.isArray(demo.stations)) demo = buildDemoData();
  for (const c of COLS) {
    if (!Array.isArray(demo[c])) (demo as unknown as Record<string, unknown>)[c] = [];
  }
  if (!demo.session) demo.session = null;
}

function saveDemo() {
  if (demo) localStorage.setItem(DEMO_KEY, JSON.stringify(demo));
}

/* ---------------- başlatma ---------------- */
export async function initDB(): Promise<Mode> {
  loadDemo();
  if (mode === 'firebase') {
    try {
      fb = ensureFirebase();
    } catch (e) {
      console.warn('Firebase başlatılamadı, demo moda geçiliyor:', e);
      mode = 'demo';
      return 'demo';
    }
  }
  return mode;
}

export const getMode = (): Mode => mode;
export const isDemo = (): boolean => mode === 'demo';

/* ---------------- görevler (şoför paneli / araç takip) ---------------- */
/** Açık (devam eden) görev durumları — bu durumlarda araç boşta sayılmaz */
export const OPEN_GOREV_DURUMLARI: GorevDurum[] = ['YENI', 'YOLDA', 'DONUS_YOLDA', 'ISTASYONDA', 'BEKLIYOR'];

export function isBosArac(vehicleId: string, gorevler: Gorev[]): boolean {
  return !gorevler.some((g) => g.vehicleId === vehicleId && OPEN_GOREV_DURUMLARI.includes(g.durum));
}

/**
 * Aracın şu an hangi istasyonda olduğunu tahmin eder:
 *   • Açık görevi varsa → görevin ilgili istasyonu (YENI'de yükleme, yolda/dönüşte varış noktası)
 *   • Boşta ise → sabit hattının yükleme istasyonu, o da yoksa son görevinin varış noktası
 */
export function aracinStasyonu(v: Vehicle, gorevler: Gorev[]): string | null {
  const open = gorevler.find((g) => g.vehicleId === v.id && OPEN_GOREV_DURUMLARI.includes(g.durum));
  if (open) return open.durum === 'YENI' ? (open.fromId || open.toId || null) : (open.toId || open.fromId || null);
  if (v.sabitFromId) return v.sabitFromId;
  const son = (gorevler || [])
    .filter((g) => g.vehicleId === v.id && g.durum === 'TAMAMLANDI')
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))[0];
  return son?.toId || null;
}

export async function createGorev(data: {
  vehicleId: string;
  tip: GorevTip;
  fromId?: string | null;
  toId?: string | null;
  dolu?: boolean;
  km?: number | null;
  soforUid?: string | null;
  soforAd?: string | null;
  not?: string;
  /** Tur zincirinde şoför yola çıkmış olarak açılır (YOLDA) */
  initialDurum?: GorevDurum;
  /** ATANDI pinine ek başlangıç pinleri (örn. DOLU_CIKTIM) */
  ekPinler?: PinTip[];
}): Promise<string> {
  const now = new Date().toISOString();
  const pins: GorevPin[] = [
    { tip: 'ATANDI', at: now, by: 'Sistem' },
    ...(data.ekPinler || []).map((tip) => ({ tip, at: now, by: data.soforAd || 'Sistem' })),
  ];
  const payload = {
    vehicleId: data.vehicleId,
    tip: data.tip,
    fromId: data.fromId,
    toId: data.toId,
    dolu: data.dolu,
    km: data.km,
    soforUid: data.soforUid,
    soforAd: data.soforAd,
    not: data.not,
    durum: (data.initialDurum || 'YENI') as GorevDurum,
    pins,
    createdAt: now,
    updatedAt: now,
  };
  return add('gorevler', payload as unknown as Record<string, unknown>);
}

/** Şoför (veya admin) pin basar: durum güncellenir + pin geçmişe eklenir. */
export async function gorevPin(gorev: Gorev, tip: PinTip, yeniDurum: GorevDurum, byAd?: string): Promise<void> {
  if (!gorev.id) throw new Error('Görev kimliği yok.');
  const now = new Date().toISOString();
  const pins: GorevPin[] = [...(gorev.pins || []), { tip, at: now, by: byAd || gorev.soforAd || 'Sistem' }];
  await update('gorevler', gorev.id, { durum: yeniDurum, pins, updatedAt: now });
}

/**
 * İstasyon araç çağırır. Atama kuralı:
 *   • vehicleIdOverride verilirse o araç atanır (yönetici manuel atama)
 *   • verilmezse BOŞTA olan araçlar arasından çağıran istasyona EN YAKIN olanı otomatik düşer
 *     (mesafe verisi yoksa araç koduna göre ilk boşta araç)
 * Boşta araç yoksa 'BOS_YOK' döner.
 */
export async function istasyondanAracCagir(
  toStationId: string,
  vehicleIdOverride?: string | null,
  byAd?: string,
): Promise<{ vehicleId: string } | 'BOS_YOK'> {
  const [vehicles, gorevler, distances] = await Promise.all([
    list('vehicles'), list('gorevler'), list('distances'),
  ]);
  const uygun = (vehicles as Vehicle[]).filter((v) => v.status === 'AKTIF');
  let secilen: Vehicle | null = null;
  if (vehicleIdOverride) {
    secilen = uygun.find((v) => v.id === vehicleIdOverride) || null;
  } else {
    const boslar = uygun.filter((v) => isBosArac(v.id, gorevler as Gorev[]));
    const kmTo = (v: Vehicle): number | null =>
      distanceBetween(distances as Distance[], aracinStasyonu(v, gorevler as Gorev[]), toStationId);
    secilen = boslar.sort((a, b) => {
      const da = kmTo(a), dbs = kmTo(b);
      if (da != null && dbs != null && da !== dbs) return da - dbs;
      if (da == null && dbs != null) return 1;
      if (da != null && dbs == null) return -1;
      return (a.code || '').localeCompare(b.code || '', 'tr');
    })[0] || null;
  }
  if (!secilen) return 'BOS_YOK';
  const sofor = await soforOfVehicle(secilen.id);
  await createGorev({
    vehicleId: secilen.id,
    tip: 'CAGRI',
    toId: toStationId,
    dolu: false,
    soforUid: sofor?.uid || null,
    soforAd: sofor?.displayName || null,
    not: byAd ? `${byAd} tarafından çağrıldı` : undefined,
  });
  return { vehicleId: secilen.id };
}

/** Araca atanmış (rolü şoför olan) kullanıcıyı bulur. */
export async function soforOfVehicle(vehicleId: string): Promise<UserProfile | null> {
  try {
    const users = (await list('users')) as (UserProfile & { uid?: string; id?: string })[];
    const hit = users.find((u) => u.role === 'sofor' && u.vehicleId === vehicleId) || null;
    // Firestore satırlarında uid yoksa doc id'sinden doldurulur.
    return hit ? { ...hit, uid: hit.uid || hit.id || '' } : null;
  } catch { return null; }
}

/**
 * Admin, paneli terk etmeden yeni kullanıcı açar (şoför vb.).
 * Firebase modunda İKİNCİL bir App örneği kullanılır — mevcut admin oturumu korunur.
 */
export async function adminCreateUser(p: {
  email: string; password: string; displayName: string; role: Role; vehicleId?: string | null;
}): Promise<{ uid: string; profileOk: boolean }> {
  const email = (p.email || '').trim();
  if (!email || !/\S+@\S+\.\S+$/.test(email)) throw new Error('Geçerli bir e-posta girin.');
  if (!p.password || p.password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');

  if (mode === 'demo') {
    loadDemo();
    const users = demoRows('users');
    if (users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) throw new Error('Bu e-posta zaten kayıtlı.');
    const user: UserProfile & { uid: string } = {
      uid: uid(), email, displayName: p.displayName || email.split('@')[0], role: p.role,
      vehicleId: p.vehicleId || null, createdAt: new Date().toISOString(),
    };
    demo!.users.push(user); saveDemo(); emitCol('users');
    return { uid: user.uid, profileOk: true };
  }

  const f = fb!;
  const app2 = initializeApp(getFirebaseConfig(), 'yatsan-kullanici-ekle-' + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(app2), email, p.password);
    try { if (p.displayName) await updateProfile(cred.user, { displayName: p.displayName }); } catch { /* önemsiz */ }
    let profileOk = true;
    try {
      await setDoc(doc(f.db, 'users', cred.user.uid), {
        email: cred.user.email, displayName: p.displayName || email.split('@')[0],
        role: p.role, vehicleId: p.vehicleId || null, createdAt: serverTimestamp(),
      });
    } catch {
      // Kurallar eskiyse profil yazılamayabilir — kullanıcı ilk girişinde kendiliğinden oluşur.
      profileOk = false;
    }
    return { uid: cred.user.uid, profileOk };
  } finally {
    try { await deleteApp(app2); } catch { /* yoksay */ }
  }
}

/* ---------------- kimlik doğrulama ---------------- */
export function onAuth(cb: AuthCb): void {
  authCbs.add(cb);
  if (mode === 'demo') {
    setTimeout(() => cb(demoSessionUser()), 0);
  } else if (fb) {
    onAuthStateChanged(fb.auth, async (u) => {
      if (!u) { emitAuth(null); return; }
      const prof = await ensureUserProfile(u);
      emitAuth(prof);
    });
  }
}

async function ensureUserProfile(u: { uid: string; email: string | null; displayName?: string | null }): Promise<UserProfile> {
  const f = fb!;
  try {
    const snap = await getDoc(doc(f.db, 'users', u.uid));
    if (snap.exists()) {
      const d = snap.data() as Partial<UserProfile>;
      return {
        uid: u.uid, email: u.email,
        displayName: d.displayName || u.displayName || (u.email || '').split('@')[0],
        role: d.role || 'izleyici',
        vehicleId: d.vehicleId ?? null,
      };
    }
    // ilk kullanıcı mı? → admin
    let role: UserProfile['role'] = 'izleyici';
    try {
      const q = query(collection(f.db, 'users'));
      const cnt = await getCountFromServer(q);
      if (cnt.data().count === 0) role = 'admin';
    } catch { /* kural engellerse izleyici kalır */ }
    await setDoc(doc(f.db, 'users', u.uid), {
      email: u.email, displayName: u.displayName || (u.email || '').split('@')[0],
      role, createdAt: serverTimestamp(),
    });
    return { uid: u.uid, email: u.email, displayName: u.displayName || (u.email || '').split('@')[0], role, vehicleId: null };
  } catch (e) {
    console.warn('Profil okunamadı:', e);
    return { uid: u.uid, email: u.email, displayName: (u.email || '').split('@')[0], role: 'izleyici', vehicleId: null };
  }
}

export async function signUp(email: string, password: string, displayName?: string): Promise<UserProfile> {
  email = (email || '').trim();
  if (mode === 'demo') {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Geçerli bir e-posta girin.');
    if (!password || password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
    const users = demoRows('users');
    if (users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) throw new Error('Bu e-posta zaten kayıtlı.');
    const role: UserProfile['role'] = users.some((u) => u.role === 'admin') ? 'izleyici' : 'admin';
    const user: UserProfile = {
      uid: uid(), email, displayName: displayName || email.split('@')[0], role,
      createdAt: new Date().toISOString(),
    };
    demo!.users.push(user as UserProfile & { uid: string });
    demo!.session = user.uid; saveDemo();
    emitAuth(user);
    return user;
  }
  const f = fb!;
  const cred = await createUserWithEmailAndPassword(f.auth, email, password);
  if (displayName) { try { await updateProfile(cred.user, { displayName }); } catch { /* önemsiz */ } }
  const prof = await ensureUserProfile({ uid: cred.user.uid, email: cred.user.email, displayName });
  emitAuth(prof);
  return prof;
}

export async function signIn(email: string, password: string): Promise<UserProfile> {
  email = (email || '').trim();
  if (mode === 'demo') {
    const users = demoRows('users');
    const user = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('Bu e-posta ile kayıtlı kullanıcı yok. Kayıt olun veya demo hesabını kullanın.');
    if (!password || password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
    demo!.session = user.uid; saveDemo();
    emitAuth(user);
    return user;
  }
  const f = fb!;
  const cred = await signInWithEmailAndPassword(f.auth, email, password);
  const prof = await ensureUserProfile(cred.user);
  emitAuth(prof);
  return prof;
}

export async function signOutUser(): Promise<void> {
  if (mode === 'demo') { if (demo) { demo.session = null; saveDemo(); } emitAuth(null); return; }
  await signOut(fb!.auth);
}

export async function resetPassword(email: string): Promise<void> {
  email = (email || '').trim();
  if (mode === 'demo') throw new Error('Demo modunda şifre sıfırlama yoktur. Firebase bağlandıktan sonra kullanılabilir.');
  await sendPasswordResetEmail(fb!.auth, email);
}

function demoSessionUser(): UserProfile | null {
  if (!demo || !demo.session) return null;
  return demo.users.find((u) => u.uid === demo!.session) || null;
}

/* ---------------- CRUD ---------------- */
/**
 * Firestore Timestamp / Date alanlarını ISO string'e çevirir.
 * (serverTimestamp ile yazılan createdAt/updatedAt okurken Timestamp NESNESİ döner;
 *  view'lar string bekler — aksi halde ".localeCompare is not a function" ile uygulama çöker.)
 */
function normalizeDates<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const out = { ...(row as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v && typeof v === 'object') {
      if (typeof (v as { toDate?: unknown }).toDate === 'function') {
        try { out[k] = (v as { toDate(): Date }).toDate().toISOString(); } catch { /* olduğu gibi kalsın */ }
      } else if (v instanceof Date) {
        try { out[k] = v.toISOString(); } catch { /* olduğu gibi kalsın */ }
      }
    }
  }
  return out as T;
}

export async function list<C extends ColName>(col: C): Promise<DemoDB[C]> {
  if (mode === 'demo') return demoRows(col).map((x) => ({ ...(x as object) })) as DemoDB[C];
  const f = fb!;
  const snap = await getDocs(collection(f.db, col));
  return snap.docs.map((d) => normalizeDates({ id: d.id, ...d.data() })) as DemoDB[C];
}

export async function add<C extends ColName>(col: C, data: Record<string, unknown>, explicitId: string | null = null): Promise<string> {
  const d = { ...data };
  if (mode === 'demo') {
    (d as { id?: string }).id = explicitId || uid();
    if (!d.createdAt) (d as { createdAt?: string }).createdAt = new Date().toISOString();
    (demo![col] as unknown[]).push(d);
    saveDemo(); emitCol(col);
    return (d as { id: string }).id;
  }
  const f = fb!;
  const payload = { ...d };
  delete payload.id;
  if (!payload.createdAt) payload.createdAt = serverTimestamp();
  if (explicitId) {
    await setDoc(doc(f.db, col, explicitId), payload);
    return explicitId;
  }
  const ref = await addDoc(collection(f.db, col), payload);
  return ref.id;
}

export async function update(col: ColName, id: string, patch: Record<string, unknown>): Promise<void> {
  if (!id) throw new Error('Kayıt kimliği bulunamadı. Sayfayı yenileyip tekrar deneyin.');
  if (mode === 'demo') {
    const arr = demo![col] as { id?: string; uid?: string }[];
    const i = arr.findIndex((x) => (x.id || x.uid) === id);
    if (i === -1) throw new Error('Kayıt bulunamadı.');
    arr[i] = { ...arr[i], ...patch };
    saveDemo(); emitCol(col);
    return;
  }
  const f = fb!;
  const p = { ...patch };
  delete p.id;
  await setDoc(doc(f.db, col, id), p, { merge: true });
}

export async function remove(col: ColName, id: string): Promise<void> {
  if (!id) throw new Error('Kayıt kimliği bulunamadı. Sayfayı yenileyip tekrar deneyin.');
  if (mode === 'demo') {
    demo![col] = (demo![col] as { id?: string; uid?: string }[]).filter(
      (x) => (x.id || x.uid) !== id,
    ) as never;
    saveDemo(); emitCol(col);
    return;
  }
  await deleteDoc(doc(fb!.db, col, id));
}

/** Koleksiyonu canlı dinler; değişince cb(rows) çağrılır. Unsubscribe döner. */
export function watch<C extends ColName>(col: C, cb: (rows: DemoDB[C]) => void): () => void {
  if (mode === 'demo') {
    if (!dataCbs[col]) dataCbs[col] = new Set();
    const wrapped = cb as (rows: unknown[]) => void;
    dataCbs[col]!.add(wrapped);
    setTimeout(() => cb(demoRows(col).map((x) => ({ ...(x as object) })) as DemoDB[C]), 0);
    return () => { dataCbs[col]!.delete(wrapped); };
  }
  const f = fb!;
  return onSnapshot(collection(f.db, col), (snap) => {
    cb(snap.docs.map((d) => normalizeDates({ id: d.id, ...d.data() })) as DemoDB[C]);
  }, (err) => console.warn(`${col} dinlenemedi:`, err));
}

/* ---------------- numaralandırma ---------------- */
export async function nextNo(col: 'requests' | 'routes' | 'shipments', prefix: string): Promise<string> {
  const rows = (await list(col)) as { no?: string }[];
  let n = rows.length + 1;
  const exists = (no: string) => rows.some((r) => r.no === no);
  let no: string;
  do { no = `${prefix}-${String(n).padStart(4, '0')}`; n++; } while (exists(no));
  return no;
}

/* ---------------- mesafe yardımcıları ---------------- */
export function distKey(a: string, b: string): string {
  return [a, b].sort().join('__');
}

export function distanceBetween(distances: Distance[], aId?: string | null, bId?: string | null): number | null {
  if (!aId || !bId) return null;
  if (aId === bId) return 0;
  const hit = distances.find((d) =>
    (d.fromId === aId && d.toId === bId) || (d.fromId === bId && d.toId === aId));
  return hit ? Number(hit.meters) : null;
}

export async function saveDistance(aId: string, bId: string, meters: number | null): Promise<void> {
  const key = distKey(aId, bId);
  if (meters == null || meters === ('' as unknown) || isNaN(meters)) {
    await remove('distances', key);
    return;
  }
  await add('distances', { fromId: aId, toId: bId, meters: Number(meters) }, key);
  if (mode === 'demo') { saveDemo(); emitCol('distances'); }
}

/* ---------------- rota hesapları ---------------- */
export function computeRoute(route: Pick<RoutePlan, 'startStationId' | 'stops'>, distances: Distance[]): RouteTotals {
  let total = 0, loaded = 0, empty = 0, missing = 0;
  let prev: string | null = route.startStationId || null;
  for (const s of route.stops || []) {
    let m = s.leg && s.leg.meters != null ? Number(s.leg.meters) : distanceBetween(distances, prev, s.stationId);
    if (m == null) { missing++; m = 0; }
    total += m;
    if (s.leg && s.leg.loaded) loaded += m; else empty += m;
    prev = s.stationId;
  }
  return { total, loaded, empty, missing, emptyPct: total > 0 ? Math.round((empty / total) * 100) : 0 };
}

/** Durak eklemede dolu/boş önerisi: önceki duraktan yük alınıyor mu? */
export function suggestLoaded(requests: TransportRequest[], prevStationId: string | null, stop: { requestIds?: string[] }): boolean {
  const ids = stop.requestIds || [];
  return requests.some((r) => ids.includes(r.id) && r.fromId === prevStationId);
}

/* ---------------- demo → Firebase taşıma ---------------- */
export async function exportDemoToFirebase(parts: Record<string, boolean>): Promise<number> {
  if (mode !== 'firebase') throw new Error('Firebase yapılandırılmadı.');
  loadDemo();
  const f = fb!;
  const groups: Record<string, ColName[]> = {
    tanimlar: ['stations', 'distances', 'vehicles'],
    talepler: ['requests', 'routes'],
    sevkiyat: ['shipments'],
  };
  const cols = Object.entries(parts).filter(([, v]) => v).flatMap(([k]) => groups[k] || []);
  let count = 0;
  const batch = writeBatch(f.db);
  for (const col of cols) {
    for (const row of demo![col] as { id?: string; uid?: string; fromId?: string; toId?: string; createdAt?: unknown }[]) {
      const id = row.id || row.uid || distKey(row.fromId || '', row.toId || '');
      const payload: Record<string, unknown> = { ...row };
      delete payload.id; delete payload.uid;
      if (payload.createdAt && typeof payload.createdAt === 'string') {
        try { payload.createdAt = new Date(payload.createdAt); } catch { /* kalır */ }
      }
      batch.set(doc(f.db, col, id), payload);
      count++;
    }
  }
  await batch.commit();
  return count;
}

/* ---------------- demo yardımcıları ---------------- */
export function seedDemoData(): void {
  demo = buildDemoData();
  saveDemo();
  COLS.forEach((c) => emitCol(c));
}

export function clearAllData(): void {
  loadDemo(); // referans tazele
  for (const c of COLS) (demo![c] as unknown[]) = [];
  demo!.session = null;
  saveDemo();
  COLS.forEach((c) => emitCol(c));
  if (mode === 'demo') emitAuth(null);
}

export function demoHasData(): boolean {
  return !!demo && (demo.stations.length > 0 || demo.vehicles.length > 0 || demo.requests.length > 0);
}

export const today = todayISO;

/* ---- yaygın tip takma adları (görünümler için) ---- */
export type { Station, Vehicle, TransportRequest, RoutePlan, Shipment, Distance, UserProfile };
