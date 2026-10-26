// ============================================================
// Yatsan İç Lojistik Planlama — tip tanımları
// ============================================================

export type Role = 'admin' | 'planlayici' | 'izleyici' | 'sofor';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  role: Role;
  /** Şoför rolünde: bu kullanıcının panelinde görünecek araç */
  vehicleId?: string | null;
  createdAt?: string | object;
}

export type StationType =
  | 'MERKEZ_DEPO' | 'YATAK_DEPO' | 'SEVKIYAT_DEPO'
  | 'DIS_TEDARIKCI' | 'URETIM' | 'DIGER';

export interface Station {
  id: string;
  code: string;
  name: string;
  type: StationType;
  note?: string;
  active?: boolean;
  /** Canlı harita konumu (Araç Takip → Harita): enlem/boylam; düzenleme modunda haritadan seçilir */
  lat?: number | null;
  lng?: number | null;
  createdAt?: string;
}

export interface Distance {
  id: string; // fromId__toId (sıralı)
  fromId: string;
  toId: string;
  meters: number;
}

export type VehicleType = 'FORKLIFT' | 'TRANSPALET' | 'CEKICI' | 'KAMYONET' | 'DIGER';
export type VehicleStatus = 'AKTIF' | 'BAKIMDA' | 'PASIF';

export interface Vehicle {
  id: string;
  code: string;
  name?: string;
  type: VehicleType;
  capacityKg?: number | null;
  driver?: string;
  status: VehicleStatus;
  /** Sabit hat: araç sürekli bu istasyondan yükler */
  sabitFromId?: string | null;
  /** Sabit hat: araç sürekli bu istasyona boşaltır */
  sabitToId?: string | null;
  /** Şoför vardiya kayıtları — tarih → mola/bekleme/paydos (yazan: şoför paneli) */
  gunluk?: Record<string, GunlukKaydi>;
  note?: string;
  createdAt?: string;
}

/* ---------------- Vardiya kayıtları (mola / bekleme / paydos) ---------------- */
export type MolaTip = 'YEMEK' | 'CAY' | 'BEKLEME';

/** Tek bir mola/bekleme kaydı: b=başlangıç ISO, t=bitiş ISO (null → sürüyor) */
export interface MolaKaydi {
  tip: MolaTip;
  b: string;
  t?: string | null;
  /** BEKLEME için: hangi istasyonda bekliyor */
  ist?: string | null;
  /** BEKLEME için: dolu mu boş mu bekliyor */
  dolu?: boolean;
}

export interface GunlukKaydi {
  molalar?: MolaKaydi[];
  /** Paydos (işe çıkış sonu) saati — ISO */
  paydos?: string | null;
  /** "İş başı yaptım" pini — paydosu kaldırır; ayrıca paydos sabah 08:00'de otomatik düşer */
  isbasi?: string | null;
}

/* ---------------- Görevler (şoför paneli / araç takip) ---------------- */
export type GorevTip = 'HAT' | 'CAGRI';
/**
 * Görev durum akışı (dolu hat turu):
 *   YENI → YOLDA (dolu yola çıktım) → BEKLIYOR (vardım dolu, indirme bekliyorum)
 *   → DONUS_YOLDA (indirme tamam, hedef istasyona yola çıktım)
 *   → ISTASYONDA (hedef istasyona vardım) → TAMAMLANDI (yükleme bitince yeni dolu tur açılır)
 */
export type GorevDurum = 'YENI' | 'YOLDA' | 'DONUS_YOLDA' | 'ISTASYONDA' | 'BEKLIYOR' | 'TAMAMLANDI' | 'IPTAL';
export type PinTip =
  | 'ATANDI' | 'CIKTIM'
  | 'DOLU_CIKTIM'    // dolu yola çıktım (yükleme bitti, yola çıkıldı)
  | 'VARDIM_DOLU'    // vardım — dolu, indirme bekliyorum
  | 'VARDIM_BOS'     // vardım — yer boş (indirme yapılamadı, dönüşe geçildi)
  | 'DONUS_CIKTIM'   // indirme tamam — hedef istasyona yola çıktım (boş dönüş)
  | 'HEDEF_VARDIM'   // hedef (yükleme) istasyona vardım
  | 'ISTASYONDA' | 'TAMAM' | 'IPTAL';

export interface GorevPin {
  tip: PinTip;
  at: string; // ISO
  by?: string;
}

export interface Gorev {
  id?: string;
  vehicleId: string;
  soforUid?: string | null;
  soforAd?: string | null;
  tip: GorevTip;
  fromId?: string | null;
  toId?: string | null;
  /** Dolu mu boş mu hareket */
  dolu?: boolean;
  km?: number | null;
  durum: GorevDurum;
  pins: GorevPin[];
  not?: string;
  /** Talepten oluşturulduysa: kaynak talep no / malzeme / miktar */
  requestId?: string | null;
  talepNo?: string | null;
  malzeme?: string | null;
  miktar?: string | null;
  /** Talep görevinde şoförün yapacağı toplam sefer sayısı (1 = tek gidiş-gelişsiz iş) */
  seferSayisi?: number | null;
  /** Tamamlanan sefer sayısı (ara seferler boş dönüşle tamamlanır) */
  bitenSefer?: number | null;
  /** İstasyon çağrısından açılan seferli görev (talep değildir; çağıran istasyon = yükleme noktası) */
  cagriSefer?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Görevin toplam sefer sayısı (1'in altına düşmez) */
export function seferToplam(g: Pick<Gorev, 'seferSayisi'>): number {
  const n = Math.round(Number(g.seferSayisi) || 1);
  return Math.max(1, n || 1);
}

/** Tamamlanan sefer sayısı — görev kapandıysa en az toplam kadar sayılır */
export function seferBiten(g: Pick<Gorev, 'bitenSefer' | 'durum' | 'seferSayisi'>): number {
  const b = Math.round(Number(g.bitenSefer) || 0);
  return g.durum === 'TAMAMLANDI' ? Math.max(b, seferToplam(g)) : b;
}

/** Sıradaki sefer tamamlanınca görev biter mi? */
export function seferSonMu(g: Pick<Gorev, 'bitenSefer' | 'seferSayisi'>): boolean {
  return (Math.round(Number(g.bitenSefer) || 0) + 1) >= seferToplam(g);
}

/**
 * Tamamlanan görevin sonunda aracın kaldığı istasyon ("son kaldığı istasyon"):
 * son konum pinine göre çözülür — 1 seferlik talep işinde hedef istasyon,
 * boş dönüşle kapanan sabit hat turunda yükleme istasyonu, çağrıda çağrılan istasyon.
 */
export function gorevSonIst(g: Pick<Gorev, 'tip' | 'fromId' | 'toId' | 'pins'>): string | null {
  const pins = g.pins || [];
  for (let i = pins.length - 1; i >= 0; i--) {
    const t = pins[i].tip;
    if (t === 'VARDIM_DOLU' || t === 'VARDIM_BOS') return g.toId || g.fromId || null;
    if (t === 'HEDEF_VARDIM' || t === 'ISTASYONDA')
      return g.tip === 'CAGRI' ? (g.toId || g.fromId || null) : (g.fromId || g.toId || null);
    if (t === 'DONUS_CIKTIM') return g.fromId || g.toId || null;
    if (t === 'DOLU_CIKTIM' || t === 'CIKTIM') return g.toId || g.fromId || null;
  }
  return gorevDonusVar(g) ? (g.fromId || g.toId || null) : (g.toId || g.fromId || null);
}

/**
 * Görevin tahmini kat ettiği mesafe (metre): çok seferli talep görevinde
 * N dolu bacak + (N−1) boş dönüş bacağı; tek seferde dolu/boş durumuna göre tek yön × (dönüş varsa 2).
 */
export function gorevKm(g: Pick<Gorev, 'dolu' | 'seferSayisi' | 'pins'>, tekYonM: number | null): { dolu: number; bos: number } {
  if (tekYonM == null || !isFinite(tekYonM)) return { dolu: 0, bos: 0 };
  const n = seferToplam(g);
  if (n > 1) return { dolu: tekYonM * n, bos: tekYonM * (n - 1) };
  // Boş hareketin gidiş bacağı da boş km'dir (+ dönüş bacağı varsa o da)
  return { dolu: g.dolu ? tekYonM : 0, bos: (g.dolu ? 0 : tekYonM) + (gorevDonusVar(g) ? tekYonM : 0) };
}

/** Görev pinlerinden dönüş bacağı (boş dönüş) yapılmış mı? */
export function gorevDonusVar(g: Pick<Gorev, 'pins'>): boolean {
  return (g.pins || []).some((p) => p.tip === 'DONUS_CIKTIM' || p.tip === 'HEDEF_VARDIM');
}

/** Talepten türemiş görev mi? (rozet "Talep seferi" olarak gösterilir) */
export function gorevTalepMi(g: Pick<Gorev, 'requestId' | 'talepNo'>): boolean {
  return !!g.requestId || !!g.talepNo;
}

export type ReqStatus = 'BEKLEMEDE' | 'ONAYLANDI' | 'PLANLANDI' | 'TAMAMLANDI' | 'IPTAL';
export type Priority = 'DUSUK' | 'NORMAL' | 'YUKSEK' | 'ACIL';

export interface TransportRequest {
  id: string;
  no: string;
  date: string; // ISO yyyy-mm-dd
  requesterId: string;
  fromId: string;
  toId: string;
  material: string;
  qty?: string;
  priority: Priority;
  status: ReqStatus;
  note?: string;
  createdBy?: string;
  createdAt?: string;
}

export type RouteStatus = 'TASLAK' | 'ONAYLANDI' | 'TAMAMLANDI';
export type StopAction = 'YUKLEME' | 'BOSALTMA' | 'GECIS';

export interface RouteStop {
  stationId: string;
  action: StopAction;
  requestIds: string[];
  leg: { loaded: boolean; meters?: number | null };
}

export interface RouteTotals {
  total: number;
  loaded: number;
  empty: number;
  missing: number;
  emptyPct: number;
}

export interface RoutePlan {
  id: string;
  no?: string;
  date: string;
  vehicleId: string;
  driver?: string;
  start?: string; // hh:mm
  startStationId: string;
  status: RouteStatus;
  stops: RouteStop[];
  totals?: RouteTotals;
  createdAt?: string;
}

export type ShipStatus = 'PLANLANDI' | 'YOLDA' | 'TAMAMLANDI' | 'IPTAL';
export type ShipDirection = 'GELEN' | 'GIDEN';

export interface Shipment {
  id: string;
  no: string;
  direction: ShipDirection;
  partner: string;
  date: string;
  fromId?: string | null;
  toId?: string | null;
  pallets?: number | null;
  qty?: string;
  plate?: string;
  status: ShipStatus;
  note?: string;
  createdAt?: string;
}

export type ColName = 'users' | 'stations' | 'distances' | 'vehicles' | 'requests' | 'routes' | 'shipments' | 'gorevler';

export interface DemoDB {
  users: (UserProfile & { uid: string })[];
  stations: Station[];
  distances: Distance[];
  vehicles: Vehicle[];
  requests: TransportRequest[];
  routes: RoutePlan[];
  shipments: Shipment[];
  gorevler: Gorev[];
  session: string | null;
}
