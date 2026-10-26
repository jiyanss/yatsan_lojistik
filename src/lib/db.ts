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
  getFirestore, onSnapshot, query, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore';
import { ensureFirebase, getFirebaseConfig, isFirebaseConfigured, type FbContext } from './firebase';
import { fbErr } from './constants';
import { buildDemoData } from './demo-data';
import { uid, todayISO } from './format';
import type {
  ColName, DemoDB, Distance, Gorev, GorevDurum, GorevPin, GorevTip, GunlukKaydi, MolaTip, PinTip, Role,
  RoutePlan, RouteTotals, Shipment, Station, TransportRequest, UserProfile, Vehicle,
} from './types';
import { gorevSonIst, gorevTalepMi, seferBiten, seferToplam } from './types';

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
 *   • Açık görevi varsa → görevin ilgili istasyonu (YENI'de yükleme, yolda/dönüşte varış noktası,
 *     HAT görevinde ISTASYONDA = yükleme istasyonuna dönmüş demektir)
 *   • Boşta ise → SON TAMAMLANAN görevin bittiği istasyon ("son kaldığı istasyon"),
 *     hiç görev geçmişi yoksa sabit hattının yükleme istasyonu
 */
export function aracinStasyonu(v: Vehicle, gorevler: Gorev[]): string | null {
  const open = gorevler.find((g) => g.vehicleId === v.id && OPEN_GOREV_DURUMLARI.includes(g.durum));
  if (open) {
    if (open.durum === 'YENI') return open.fromId || open.toId || null;
    if (open.durum === 'ISTASYONDA')
      return open.tip === 'CAGRI' ? (open.toId || open.fromId || null) : (open.fromId || open.toId || null);
    return open.toId || open.fromId || null;
  }
  const son = (gorevler || [])
    .filter((g) => g.vehicleId === v.id && g.durum === 'TAMAMLANDI')
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))[0];
  // Boşta araç son kaldığı istasyondadır — sabit hat istasyonu yalnızca görev geçmişi yoksa varsayılır.
  return (son && gorevSonIst(son)) || v.sabitFromId || null;
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
  not?: string | null;
  /** Tur zincirinde şoför yola çıkmış olarak açılır (YOLDA) */
  initialDurum?: GorevDurum;
  /** ATANDI pinine ek başlangıç pinleri (örn. DOLU_CIKTIM) */
  ekPinler?: PinTip[];
  /** Talepten oluşturuluyorsa kaynak bilgi */
  requestId?: string | null;
  talepNo?: string | null;
  malzeme?: string | null;
  miktar?: string | null;
  /** İstasyon çağrısından açılan seferli görev işareti */
  cagriSefer?: boolean | null;
  /** Talep seferi: yapılacak toplam sefer (varsayılan 1) */
  seferSayisi?: number | null;
}): Promise<string> {
  const now = new Date().toISOString();
  const pins: GorevPin[] = [
    { tip: 'ATANDI', at: now, by: 'Sistem' },
    ...(data.ekPinler || []).map((tip) => ({ tip, at: now, by: data.soforAd || 'Sistem' })),
  ];
  const payload = {
    vehicleId: data.vehicleId,
    tip: data.tip,
    fromId: data.fromId ?? null,
    toId: data.toId ?? null,
    dolu: data.dolu ?? false,
    km: data.km ?? null,
    soforUid: data.soforUid ?? null,
    soforAd: data.soforAd ?? null,
    not: data.not ?? null,
    requestId: data.requestId ?? null,
    talepNo: data.talepNo ?? null,
    malzeme: data.malzeme ?? null,
    miktar: data.miktar ?? null,
    cagriSefer: data.cagriSefer ?? null,
    seferSayisi: seferToplam({ seferSayisi: data.seferSayisi }),
    bitenSefer: 0,
    durum: (data.initialDurum || 'YENI') as GorevDurum,
    pins,
    createdAt: now,
    updatedAt: now,
  };
  // Yeni görev düşünce aracın "Beklemedeyim" kaydı otomatik kapanır (bekleme = görev gelene kadar).
  await acikBeklemeleriKapat(data.vehicleId);
  return add('gorevler', payload as unknown as Record<string, unknown>);
}

/** Görev kapandığında aracın otomatik "boş bekliyorum" pini: açık bekleme varsa kapatılır,
 *  belirtilen istasyonda boş BEKLEME kaydı açılır (takipte "Beklemede — istasyon (boş)" görünür). */
async function bosBeklemePiniBas(vehicleId: string | null | undefined, istId: string | null | undefined): Promise<void> {
  if (!vehicleId || !istId) return;
  try { await beklemeyeGec(vehicleId, istId, false); } catch { /* pini atılamazsa görev akışı bozulmasın */ }
}

/** Görevi veri kaynağından TAZE okur. Panel/takip ekranındaki kopya onSnapshot geciktiğinde
 *  BAYATTIR; sefer sayımı ve durum kararları bu taze veriyle yapılmalı (bkz. seferTamamla). */
async function gorevGetir(id: string | null | undefined): Promise<Gorev | null> {
  if (!id) return null;
  try {
    if (mode === 'demo') return demoRows('gorevler').find((g) => g.id === id) || null;
    const snap = await getDoc(doc(fb!.db, 'gorevler', id));
    return snap.exists() ? (normalizeDates({ id: snap.id, ...snap.data() }) as Gorev) : null;
  } catch { return null; }
}

/** Şoför (veya admin) pin basar: durum güncellenir + pin geçmişe eklenir.
 *  ⚠️ Karar TAZE veriyle verilir, yazım TAZE pin dizisi üzerine yapılır:
 *  panel kopyası bayatken (a) önceki hızlı pinler siliniyordu, (b) KAPANMIŞ görev eski
 *  durumuna geri yazılabiliyordu — "2. indirmede görev bitmedi, tura devam etti" olayının
 *  katkıcılarından biri buydu. Kapanmış göreve gelen bayat basış artık reddedilir. */
export async function gorevPin(gorev: Gorev, tip: PinTip, yeniDurum: GorevDurum, byAd?: string): Promise<void> {
  if (!gorev.id) throw new Error('Görev kimliği yok.');
  const taze = (await gorevGetir(gorev.id)) || gorev;
  if (taze.durum === 'TAMAMLANDI' || taze.durum === 'IPTAL') {
    // Görev zaten kapandı — bayat tıklama onu yeniden AÇAMAZ.
    if (yeniDurum === 'TAMAMLANDI' || yeniDurum === 'IPTAL') {
      // Kapatma tekrarı: sessizce yoksay; otomatik bekleme pininin garanti olsun.
      if (taze.durum === 'TAMAMLANDI') await bosBeklemePiniBas(taze.vehicleId, gorevSonIst(taze));
      return;
    }
    throw new Error('Bu görev zaten kapandı — panel birkaç saniye içinde güncellenecek.');
  }
  // Seferli görevde (talep/çağrı seferi) "Yer boş" kısayolu sefer sayacını ATLAR — araç
  // dönüş-yükleme döngüsüne girip görev asla kapanmıyordu. İndirme yalnız "İndirme tamam"
  // (seferTamamla) ile işaretlenir; bayat ekrandan gelen basış da burada dürüstçe yönlendirilir.
  if ((gorevTalepMi(taze) || taze.cagriSefer === true) && tip === 'VARDIM_BOS') {
    throw new Error('Seferli görevde varış "Vardım — Dolu" ile, indirme ise "İndirme tamam" ile işaretlenir.');
  }
  const now = new Date().toISOString();
  const pins: GorevPin[] = [...(taze.pins || []), { tip, at: now, by: byAd || taze.soforAd || 'Sistem' }];
  await update('gorevler', gorev.id, { durum: yeniDurum, pins, updatedAt: now });
  // Kaynak talebi senkronla: görev TAMAMLANDI olunca talep de TAMAMLANDI olur,
  // görev İPTAL olunca talep yeniden atanabilir (ONAYLANDI) duruma döner.
  if (taze.requestId && yeniDurum === 'TAMAMLANDI') {
    try { await update('requests', taze.requestId, { status: 'TAMAMLANDI' }); } catch { /* talep güncellenemese de görev akışı bozulmasın */ }
  }
  if (taze.requestId && yeniDurum === 'IPTAL') {
    try { await update('requests', taze.requestId, { status: 'ONAYLANDI' }); } catch { /* yoksay */ }
  }
  // Görev kapandı: araç son kaldığı istasyonda boş bekliyor — otomatik bekleme pini.
  if (yeniDurum === 'TAMAMLANDI') {
    await bosBeklemePiniBas(taze.vehicleId, gorevSonIst({ ...taze, pins }));
  }
}

/** seferTamamla sonucu — panel, mesajı BU karara göre yazar (bayat buton etiketine değil). */
export interface SeferSonuc {
  biten: number;
  toplam: number;
  sonSefer: boolean;
  /** Görev çağrı anında zaten kapalıydı — hiçbir şey yazılmadı */
  zatenKapandi: boolean;
}

/**
 * Talep/çağrı seferi tamamlandı: bitenSefer artar.
 *   • Son seferse görev TAMAMLANDI olur → araç o istasyonda (toId) boşta kalır,
 *     kaynak talep de otomatik TAMAMLANDI'ya geçer.
 *   • Ara seferse görev DONUS_YOLDA'ya döner (boş dönüş → yeniden yükleme → sıradaki sefer).
 *
 * ⚠️ KARAR TAZE VERİYLE VERİLİR — "2 turluk işin 2. indirmesinde görev bitmedi, tura devam
 * etti" olayının kök nedeni: paneldeki görev kopyası onSnapshot geciktiğinde BAYATTI ve
 * bitenSefer eski değeriyle hesaplanıyordu (biten=1/2 → dönüş). Artık:
 *   1. Görev Firestore'dan taze okunur,
 *   2. tamamlanan sefer = max(taze bitenSefer, pinler — her tamamlanan sefer DONUS_CIKTIM/TAMAM bırakır),
 *   3. görev zaten kapalıysa yazım yok (çift tık/bayat basış idempotent karşılanır).
 */
export async function seferTamamla(gorev: Gorev, byAd?: string): Promise<SeferSonuc> {
  if (!gorev.id) throw new Error('Görev kimliği yok.');
  const taze = (await gorevGetir(gorev.id)) || gorev;
  const toplam = seferToplam(taze);
  if (taze.durum === 'TAMAMLANDI' || taze.durum === 'IPTAL') {
    // Zaten kapalı: yazım yok; yalnız otomatik "boş bekliyorum" pinini garanti et.
    if (taze.durum === 'TAMAMLANDI') await bosBeklemePiniBas(taze.vehicleId, gorevSonIst(taze));
    return { biten: seferBiten(taze), toplam, sonSefer: true, zatenKapandi: true };
  }
  const pinleBiten = (taze.pins || []).filter((p) => p.tip === 'DONUS_CIKTIM' || p.tip === 'TAMAM').length;
  const onceki = Math.max(Math.round(Number(taze.bitenSefer) || 0), pinleBiten);
  const biten = onceki + 1;
  const sonSefer = biten >= toplam;
  const now = new Date().toISOString();
  const pins: GorevPin[] = [
    ...(taze.pins || []),
    { tip: sonSefer ? 'TAMAM' : 'DONUS_CIKTIM', at: now, by: byAd || taze.soforAd || 'Sistem' },
  ];
  await update('gorevler', gorev.id, {
    bitenSefer: biten,
    durum: (sonSefer ? 'TAMAMLANDI' : 'DONUS_YOLDA') as GorevDurum,
    pins,
    updatedAt: now,
  });
  if (sonSefer && taze.requestId) {
    try { await update('requests', taze.requestId, { status: 'TAMAMLANDI' }); } catch { /* talep güncellenemese de görev akışı bozulmasın */ }
  }
  // Son seferin indirmesiyle araç son boşalttığı istasyonda boş bekler — otomatik bekleme pini.
  if (sonSefer) {
    await bosBeklemePiniBas(taze.vehicleId, taze.toId || gorevSonIst({ ...taze, pins }));
  }
  return { biten, toplam, sonSefer, zatenKapandi: false };
}

/**
 * İstasyon araç çağırır. Atama kuralı:
 *   • vehicleIdOverride verilirse o araç atanır (yönetici manuel atama)
 *   • verilmezse BOŞTA olan araçlar arasından çağıran istasyona EN YAKIN olanı otomatik düşer
 *     (mesafe verisi yoksa araç koduna göre ilk boşta araç)
 * Boşta araç yoksa 'BOS_YOK' döner.
 */
/** Boşta araçlar arasından hedef istasyona en yakını seçer (mesafe verisi yoksa kod sırası).
 *  Modal önizlemesi de aynı fonksiyonu kullanır — ekranda görünen seçimle gerçek atama birebir aynıdır. */
export function enUygunBosArac(
  uygun: Vehicle[],
  gorevler: Gorev[],
  distances: Distance[],
  routes: RoutePlan[],
  hedefIstId: string | null | undefined,
): Vehicle | null {
  const boslar = uygun.filter((v) => isBosArac(v.id, gorevler));
  if (!boslar.length) return null;
  const kmTo = (v: Vehicle): number | null =>
    enKisaKm(distances, routes, aracinStasyonu(v, gorevler), hedefIstId);
  return boslar.sort((a, b) => {
    const da = kmTo(a), dbs = kmTo(b);
    if (da != null && dbs != null && da !== dbs) return da - dbs;
    if (da == null && dbs != null) return 1;
    if (da != null && dbs == null) return -1;
    return (a.code || '').localeCompare(b.code || '', 'tr');
  })[0] || null;
}

/**
 * İstasyon araç çağırır. Atama kuralı:
 *   • vehicleIdOverride verilirse o araç atanır (yönetici manuel atama)
 *   • verilmezse BOŞTA olan araçlar arasından çağıran istasyona EN YAKIN olanı otomatik düşer
 *     (mesafe verisi yoksa araç koduna göre ilk boşta araç)
 * Boşta araç yoksa 'BOS_YOK' döner.
 *
 * Tur modu (hedefIstId + turSayisi ≥ 1): çağrı seferli bir işe dönüşür — araç çağıran
 * istasyona (YÜKLEME noktası) gider, oradan hedef istasyona turSayisi kadar
 * "yük al → götür → bırak" yapar (talep seferi akışının aynısı); SON turun indirmesiyle
 * görev TAMAMLANDI olur ve araç son boşalttığı istasyonda otomatik "boş bekliyorum" pinini alır.
 * hedefIstId verilmezse eski davranış: yalnız konumlandırma çağrısı (CAGRI).
 */
export async function istasyondanAracCagir(
  toStationId: string,
  vehicleIdOverride?: string | null,
  byAd?: string,
  hedefIstId?: string | null,
  turSayisi?: number | null,
): Promise<{ vehicleId: string } | 'BOS_YOK'> {
  const [vehicles, gorevler, distances, routes] = await Promise.all([
    list('vehicles'), list('gorevler'), list('distances'), list('routes'),
  ]);
  const uygun = (vehicles as Vehicle[]).filter((v) => v.status === 'AKTIF');
  const secilen = vehicleIdOverride
    ? uygun.find((v) => v.id === vehicleIdOverride) || null
    : enUygunBosArac(uygun, gorevler as Gorev[], distances as Distance[], routes as RoutePlan[], toStationId);
  if (!secilen) return 'BOS_YOK';
  const sofor = await soforOfVehicle(secilen.id);
  const turlar = Math.max(0, Math.round(Number(turSayisi) || 0));
  if (hedefIstId && turlar >= 1 && hedefIstId !== toStationId) {
    // TUR MODU: çağıran istasyon = yükleme, hedef = boşaltma; N seferlik TEK görev.
    await createGorev({
      vehicleId: secilen.id,
      tip: 'HAT',
      fromId: toStationId,
      toId: hedefIstId,
      dolu: true,
      km: enKisaKm(distances as Distance[], routes as RoutePlan[], toStationId, hedefIstId),
      soforUid: sofor?.uid || null,
      soforAd: sofor?.displayName || null,
      not: `İstasyon çağrısı — ${turlar} sefer${byAd ? ` (${byAd} çağırdı)` : ''}`,
      cagriSefer: true,
      seferSayisi: turlar,
    });
    return { vehicleId: secilen.id };
  }
  // KONUMLANDIRMA MODU: araç yalnız çağıran istasyona gönderilir (eski davranış).
  const cikisIst = aracinStasyonu(secilen, gorevler as Gorev[]);
  await createGorev({
    vehicleId: secilen.id,
    tip: 'CAGRI',
    fromId: cikisIst,
    toId: toStationId,
    dolu: false,
    km: enKisaKm(distances as Distance[], routes as RoutePlan[], cikisIst, toStationId),
    soforUid: sofor?.uid || null,
    soforAd: sofor?.displayName || null,
    not: byAd ? `${byAd} tarafından çağrıldı` : null,
  });
  return { vehicleId: secilen.id };
}

/**
 * Onaylı araç talebini şoför görevine dönüştürür:
 *   • vehicleIdOverride verilirse o araç (yönetici manuel atama)
 *   • verilmezse yükün ALINACAĞI istasyona (req.fromId) en yakın boşta araç otomatik seçilir
 * Görev TALEP SEFERİ olarak açılır: şoför seferSayisi kadar "yük al → götür → bırak" yapar.
 * Son seferin indirmesiyle görev (ve talep) otomatik TAMAMLANDI olur; araç teslim istasyonunda
 * ("son kaldığı istasyon") boşta kalır — ayrıca dönüş pini basması gerekmez.
 * Talep PLANLANDI durumuna geçer; şoför panelinde yanıp sönen uyarıyla bildirilir.
 */
export async function talebiGoreveDonustur(
  req: TransportRequest,
  vehicleIdOverride?: string | null,
  byAd?: string,
  seferSayisi?: number | null,
): Promise<{ vehicleId: string; gorevId: string } | 'BOS_YOK'> {
  const [vehicles, gorevler, distances, routes] = await Promise.all([
    list('vehicles'), list('gorevler'), list('distances'), list('routes'),
  ]);
  const uygun = (vehicles as Vehicle[]).filter((v) => v.status === 'AKTIF');
  const secilen = vehicleIdOverride
    ? uygun.find((v) => v.id === vehicleIdOverride) || null
    : enUygunBosArac(uygun, gorevler as Gorev[], distances as Distance[], routes as RoutePlan[], req.fromId);
  if (!secilen) return 'BOS_YOK';
  const sofor = await soforOfVehicle(secilen.id);
  const gorevId = await createGorev({
    vehicleId: secilen.id,
    tip: 'HAT',
    fromId: req.fromId,
    toId: req.toId,
    dolu: true,
    km: enKisaKm(distances as Distance[], routes as RoutePlan[], req.fromId, req.toId),
    soforUid: sofor?.uid || null,
    soforAd: sofor?.displayName || null,
    not: `${req.no} talebi — ${req.material}${req.qty ? ` (${req.qty})` : ''}`,
    requestId: req.id,
    talepNo: req.no,
    malzeme: req.material || null,
    miktar: req.qty || null,
    seferSayisi: seferSayisi ?? 1,
  });
  await update('requests', req.id, { status: 'PLANLANDI' });
  void byAd;
  return { vehicleId: secilen.id, gorevId };
}

/* ---------------- vardiya kayıtları (mola / bekleme / paydos) ---------------- */
/** Aracın bugünkü vardiya kaydını okur-günceller; fn değişiklik yapmadıysa YAZMAZ. */
async function gunlukGuncelle(vehicleId: string, fn: (k: GunlukKaydi) => GunlukKaydi): Promise<void> {
  const t = todayISO();
  if (mode === 'demo') {
    const vs = demoRows('vehicles');
    const v = vs.find((x) => x.id === vehicleId);
    if (!v) return;
    const full = { ...(v.gunluk || {}) } as Record<string, GunlukKaydi>;
    const next = fn({ ...(full[t] || {}) });
    if (JSON.stringify(next) === JSON.stringify(full[t] || {})) return;
    full[t] = next;
    v.gunluk = full;
    saveDemo(); emitCol('vehicles');
    return;
  }
  const f = fb!;
  const ref = doc(f.db, 'vehicles', vehicleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const full = ((snap.data().gunluk || {}) as Record<string, GunlukKaydi>) || {};
  const next = fn({ ...(full[t] || {}) });
  if (JSON.stringify(next) === JSON.stringify(full[t] || {})) return;
  // ⚠️ merge:true ZORUNLU — merge'siz setDoc dokümanın TÜM diğer alanlarını (kod, ad,
  // tip, sabit hat, durum…) siler; bu hata yüzünden araç kayıtları "kendiliğinden"
  // boşalmıştı (kodlar çizgiye döner, araçlar silinmiş gibi görünürdü).
  await setDoc(ref, { gunluk: { ...full, [t]: next } }, { merge: true });
}

/** Yemek / çay molası başlatır (aynı tipten açık mola varsa yeniden açmaz). */
export async function molaBaslat(vehicleId: string, tip: MolaTip): Promise<void> {
  await gunlukGuncelle(vehicleId, (k) => {
    const molalar = [...(k.molalar || [])];
    if (molalar.some((m) => m.tip === tip && !m.t)) return { ...k };
    molalar.push({ tip, b: new Date().toISOString(), t: null });
    return { ...k, molalar };
  });
}

/** Açık olan yemek / çay molasını bitirir. */
export async function molaBitir(vehicleId: string, tip: MolaTip): Promise<void> {
  const now = new Date().toISOString();
  await gunlukGuncelle(vehicleId, (k) => ({
    ...k,
    molalar: (k.molalar || []).map((m) => (m.tip === tip && !m.t ? { ...m, t: now } : m)),
  }));
}

/** Şoför "hangi istasyonda, boş/dolu beklediğini" pinler. */
export async function beklemeyeGec(vehicleId: string, ist: string | null, dolu: boolean): Promise<void> {
  const now = new Date().toISOString();
  await gunlukGuncelle(vehicleId, (k) => {
    const molalar = (k.molalar || []).map((m) => (m.tip === 'BEKLEME' && !m.t ? { ...m, t: now } : m));
    molalar.push({ tip: 'BEKLEME', b: now, t: null, ist, dolu });
    return { ...k, molalar };
  });
}

/** Açık bekleme kaydını kapatır (yeni görev düşünce de otomatik çağrılır). */
export async function beklemeyiBitir(vehicleId: string): Promise<void> {
  const now = new Date().toISOString();
  await gunlukGuncelle(vehicleId, (k) => ({
    ...k,
    molalar: (k.molalar || []).map((m) => (m.tip === 'BEKLEME' && !m.t ? { ...m, t: now } : m)),
  }));
}

/** Paydos: açık tüm mola/beklemeleri kapatır + gün sonu saatini yazar. */
export async function paydosVer(vehicleId: string): Promise<void> {
  const now = new Date().toISOString();
  await gunlukGuncelle(vehicleId, (k) => ({
    ...k,
    molalar: (k.molalar || []).map((m) => (!m.t ? { ...m, t: now } : m)),
    paydos: now,
  }));
}

/**
 * Paydos hâlâ geçerli mi?
 *   • "İş başı yaptım" pini (isbasi) paydosu kaldırır
 *   • Pin yoksa paydos, verilişinden sonraki ilk sabah 08:00'de OTOMATİK düşer
 *     (gece vardiyasında 04:00'te verilen paydos 08:00'e kadar sayılır; 18:00 paydosu
 *      ertesi sabah 08:00'e kadar sayılır — ertesi gün yeni kayıt zaten boştur)
 */
export function paydosAktif(k?: GunlukKaydi | null, now: Date = new Date()): boolean {
  if (!k?.paydos) return false;
  if (k.isbasi && k.isbasi > k.paydos) return false;
  const p = new Date(k.paydos);
  if (p > now) return true; // saat kayması: gelecek tarihli paydos geçerli sayılır
  const kesim = new Date(p);
  kesim.setHours(8, 0, 0, 0);
  if (kesim <= p) kesim.setDate(kesim.getDate() + 1); // 08:00 sonrası verildiyse ertesi sabaha kaysın
  return now < kesim;
}

/** Şoför "İş başı yaptım" pini — paydosu kaldırır, günün iş başı saatini yazar. */
export async function isBasiVer(vehicleId: string): Promise<void> {
  const now = new Date().toISOString();
  await gunlukGuncelle(vehicleId, (k) => ({ ...k, isbasi: now }));
}

/** Yeni görev açılırken aracın açık bekleme kaydını sessizce kapatır. */
async function acikBeklemeleriKapat(vehicleId: string): Promise<void> {
  try { await beklemeyiBitir(vehicleId); } catch { /* araç yoksa/erişilemezse önemli değil */ }
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
}): Promise<{ uid: string; profileOk: boolean; profileErr?: string }> {
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
    let profileErr = '';
    const profilPayload = {
      email: cred.user.email, displayName: p.displayName || email.split('@')[0],
      role: p.role, vehicleId: p.vehicleId || null, createdAt: serverTimestamp(),
    };
    // 1. TERCİH: profili YENİ KULLANICININ KENDİ oturumuyla yaz — kurallardaki
    //    "request.auth.uid == uid" (kendi profilini açma) izni HER ZAMAN geçerlidir;
    //    yönetici yetkisi / isAdmin() kuralına hiç gerek kalmaz.
    try {
      await setDoc(doc(getFirestore(app2), 'users', cred.user.uid), profilPayload);
    } catch {
      // 2. TERCİH: yönetici oturumuyla yaz (kuralda isAdmin() varsa çalışır).
      //    Geçici reddetmelere karşı 1 kez retry + sonunda yazının gerçekten yapılıp yapılmadığını doğrula.
      const profilYaz = async (): Promise<void> => {
        await setDoc(doc(f.db, 'users', cred.user.uid), profilPayload);
      };
      try {
        await profilYaz();
      } catch (e) {
        await new Promise((r) => setTimeout(r, 900)); // kurallar/kimlik token'ı için kısa bekleme
        try {
          await profilYaz();
        } catch (e2) {
          // Yazım yine de reddedildiyse belki gerçekten yazılmıştır (yanıt kaybolmuş) — doğrula.
          try {
            const snap = await getDoc(doc(f.db, 'users', cred.user.uid));
            if (snap.exists()) {
              profileOk = true;
            } else {
              profileOk = false;
              profileErr = fbErr(e2);
            }
          } catch {
            profileOk = false;
            profileErr = fbErr(e2);
          }
        }
      }
    }
    return { uid: cred.user.uid, profileOk, profileErr };
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

/**
 * Firestore'da `undefined` alan DEĞERİ yasaktır ("Unsupported field value: undefined").
 * Göndermeden önce tüm undefined'ları (nested nesne/dizi dahil) temizler —
 * böylece herhangi bir ekranda eksik alan unutulsa bile yazım asla patlamaz.
 */
function cleanUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => cleanUndefined(x)) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = cleanUndefined(val);
    }
    return out as unknown as T;
  }
  return v;
}

export async function add<C extends ColName>(col: C, data: Record<string, unknown>, explicitId: string | null = null): Promise<string> {
  const d = cleanUndefined({ ...data });
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
  const p = cleanUndefined({ ...patch });
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

/**
 * İki istasyon arasındaki EN KISA yol mesafesi (metre):
 *   1. distances koleksiyonundaki kayıtlar + rota planlarındaki bacak mesafeleri birleştirilir
 *   2. aralarında doğrudan kayıt yoksa aktarmalı en kısa yol Dijkstra ile bulunur
 * Böylece "en yakın boşta araç" seçimi, yalnızca elle girilmiş mesafelere değil,
 * rota planlarından öğrenilen mesafelere de dayanır. Hiç veri yoksa null döner.
 */
export function enKisaKm(
  distances: Distance[],
  routes: RoutePlan[],
  aId?: string | null,
  bId?: string | null,
): number | null {
  if (!aId || !bId) return null;
  if (aId === bId) return 0;
  type Kenar = { to: string; m: number };
  const graf = new Map<string, Kenar[]>();
  const kenarEkle = (x?: string | null, y?: string | null, m?: number | null) => {
    if (!x || !y || m == null || !Number.isFinite(m) || m < 0) return;
    if (!graf.has(x)) graf.set(x, []);
    if (!graf.has(y)) graf.set(y, []);
    graf.get(x)!.push({ to: y, m });
    graf.get(y)!.push({ to: x, m });
  };
  for (const d of distances || []) kenarEkle(d.fromId, d.toId, d.meters != null ? Number(d.meters) : null);
  for (const r of routes || []) {
    const stops = (r.stops || []) as RoutePlan['stops'];
    for (let i = 1; i < stops.length; i++) {
      const onceki = stops[i - 1], suanki = stops[i];
      kenarEkle(onceki?.stationId, suanki?.stationId, suanki?.leg?.meters != null ? Number(suanki.leg.meters) : null);
    }
  }
  if (!graf.has(aId) || !graf.has(bId)) return distanceBetween(distances, aId, bId);
  const mesafe = new Map<string, number>([[aId, 0]]);
  const kuyruk: { id: string; m: number }[] = [{ id: aId, m: 0 }];
  while (kuyruk.length) {
    kuyruk.sort((x, y) => x.m - y.m);
    const cur = kuyruk.shift()!;
    if (cur.m > (mesafe.get(cur.id) ?? Infinity)) continue;
    if (cur.id === bId) return cur.m;
    for (const e of graf.get(cur.id) || []) {
      const nm = cur.m + e.m;
      if (nm < (mesafe.get(e.to) ?? Infinity)) {
        mesafe.set(e.to, nm);
        kuyruk.push({ id: e.to, m: nm });
      }
    }
  }
  return mesafe.get(bId) ?? distanceBetween(distances, aId, bId);
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
