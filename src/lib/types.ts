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
  createdAt?: string;
  updatedAt?: string;
}

/** Görev pinlerinden dönüş bacağı (boş dönüş) yapılmış mı? */
export function gorevDonusVar(g: Pick<Gorev, 'pins'>): boolean {
  return (g.pins || []).some((p) => p.tip === 'DONUS_CIKTIM' || p.tip === 'HEDEF_VARDIM');
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
