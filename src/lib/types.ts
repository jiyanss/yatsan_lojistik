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
  note?: string;
  createdAt?: string;
}

/* ---------------- Görevler (şoför paneli / araç takip) ---------------- */
export type GorevTip = 'HAT' | 'CAGRI';
export type GorevDurum = 'YENI' | 'YOLDA' | 'ISTASYONDA' | 'BEKLIYOR' | 'TAMAMLANDI' | 'IPTAL';
export type PinTip = 'ATANDI' | 'CIKTIM' | 'ISTASYONDA' | 'VARDIM_BOS' | 'VARDIM_DOLU' | 'TAMAM' | 'IPTAL';

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
  createdAt?: string;
  updatedAt?: string;
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
