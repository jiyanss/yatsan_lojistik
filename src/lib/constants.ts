// ============================================================
// Sabit etiketler ve durum eşlemeleri
// ============================================================
import type { GorevDurum, GorevTip, PinTip, Priority, ReqStatus, Role, RouteStatus, ShipDirection, ShipStatus, StationType, StopAction, VehicleStatus, VehicleType } from './types';

export const REQ_STATUS: Record<ReqStatus, string> = {
  BEKLEMEDE: 'Beklemede', ONAYLANDI: 'Onaylandı', PLANLANDI: 'Plana Alındı',
  TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
};

export const PRIORITY: Record<Priority, string> = {
  DUSUK: 'Düşük', NORMAL: 'Normal', YUKSEK: 'Yüksek', ACIL: 'Acil',
};

export const ROUTE_STATUS: Record<RouteStatus, string> = {
  TASLAK: 'Taslak', ONAYLANDI: 'Onaylandı', TAMAMLANDI: 'Tamamlandı',
};

export const SHIP_STATUS: Record<ShipStatus, string> = {
  PLANLANDI: 'Planlandı', YOLDA: 'Yolda', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
};

export const VEHICLE_STATUS: Record<VehicleStatus, string> = {
  AKTIF: 'Aktif', BAKIMDA: 'Bakımda', PASIF: 'Pasif',
};

export const STATION_TYPES: Record<StationType, string> = {
  MERKEZ_DEPO: 'Merkez Depo', YATAK_DEPO: 'Yatak Depo', SEVKIYAT_DEPO: 'Sevkiyat Depo',
  DIS_TEDARIKCI: 'Dış Tedarikçi', URETIM: 'Üretim İstasyonu', DIGER: 'Diğer',
};

export const VEHICLE_TYPES: Record<VehicleType, string> = {
  FORKLIFT: 'Forklift', TRANSPALET: 'Transpalet', CEKICI: 'Çekici (Trawas)', KAMYONET: 'Kamyonet', DIGER: 'Diğer',
};

export const STOP_ACTIONS: Record<StopAction, string> = {
  YUKLEME: 'Yükleme', BOSALTMA: 'Boşaltma', GECIS: 'Boş Geçiş',
};

export const ROLES: Record<Role, string> = {
  admin: 'Yönetici', planlayici: 'Planlayıcı', izleyici: 'İzleyici', sofor: 'Şoför',
};

/* ---------------- Görev (şoför paneli / araç takip) etiketleri ---------------- */
export const GOREV_DURUM: Record<GorevDurum, string> = {
  YENI: 'Yeni görev', YOLDA: 'Yolda', DONUS_YOLDA: 'Dönüşte (boş)', ISTASYONDA: 'İstasyonda',
  BEKLIYOR: 'Dolu bekliyor', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
};

export const GOREV_TIP: Record<GorevTip, string> = {
  HAT: 'Sabit hat', CAGRI: 'İstasyon çağrısı',
};

/** Şoför vardiya kayıtları (mola / bekleme) etiketleri */
export const MOLA_TIP: Record<string, string> = {
  YEMEK: 'Yemek molası',
  CAY: 'Çay molası',
  BEKLEME: 'Bekleme',
};

/** Şoförün panelde bastığı pinler */
export const PIN_LABEL: Record<PinTip, string> = {
  ATANDI: 'Görev atandı',
  CIKTIM: 'Çıktım — yolda',
  DOLU_CIKTIM: 'Dolu yola çıktım',
  VARDIM_DOLU: 'Vardım — dolu, indirme bekliyorum',
  VARDIM_BOS: 'Vardım — yer boş',
  DONUS_CIKTIM: 'Hedef istasyona yola çıktım',
  HEDEF_VARDIM: 'Hedef istasyona vardım',
  ISTASYONDA: 'İstasyonda oldum',
  TAMAM: 'İş tamam',
  IPTAL: 'İptal edildi',
};

export function roleLabel(role?: string | null): string {
  return ROLES[(role || '') as Role] || (role || '');
}

/** Koleksiyonları gruplar halinde (demo→Firebase taşıma ekranı için) */
export const MIGRATE_GROUPS: Record<string, string[]> = {
  tanimlar: ['stations', 'distances', 'vehicles'],
  talepler: ['requests', 'routes'],
  sevkiyat: ['shipments'],
};

export const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  function role() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
  }
  function isAdmin() {
    return request.auth != null && role() == 'admin';
  }
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && (request.auth.uid == uid || isAdmin());
      allow update, delete: if request.auth != null;
    }
    match /stations/{id}   { allow read, write: if request.auth != null; }
    match /distances/{id}  { allow read, write: if request.auth != null; }
    match /vehicles/{id}   { allow read, write: if request.auth != null; }
    match /requests/{id}   { allow read, write: if request.auth != null; }
    match /routes/{id}     { allow read, write: if request.auth != null; }
    match /shipments/{id}  { allow read, write: if request.auth != null; }
    match /gorevler/{id}   { allow read, write: if request.auth != null; }
  }
}`;

/** Kullanıcıya gösterilecek Firebase hata mesajları */
export function fbErr(e: unknown): string {
  const code = (e && typeof e === 'object' && 'code' in e) ? String((e as { code: string }).code).replace('auth/', '') : '';
  const map: Record<string, string> = {
    'invalid-credential': 'E-posta veya şifre hatalı.',
    'invalid-email': 'Geçersiz e-posta adresi.',
    'user-not-found': 'Bu e-posta ile kayıtlı kullanıcı yok.',
    'wrong-password': 'E-posta veya şifre hatalı.',
    'email-already-in-use': 'Bu e-posta zaten kayıtlı.',
    'weak-password': 'Şifre en az 6 karakter olmalı.',
    'too-many-requests': 'Çok fazla deneme yapıldı, biraz bekleyin.',
    'network-request-failed': 'Ağ hatası — bağlantınızı kontrol edin.',
    'user-disabled': 'Hesap devre dışı bırakılmış.',
    'permission-denied': 'Yetkiniz yok. Firestore kurallarını kontrol edin.',
    'unavailable': 'Servise ulaşılamıyor, internet bağlantısını kontrol edin.',
    "operation-not-allowed": "Bu giriş yöntemi Firebase'de kapalı. Firebase Console → Authentication → Sign-in method → Email/Password etkinleştirin.",
    "configuration-not-found": "Authentication henüz kurulu değil. Firebase Console → Authentication açın ve Email/Password yöntemini etkinleştirin.",
    "api-key-not-valid": "API anahtarı geçersiz. NEXT_PUBLIC_FIREBASE_* değişkenlerini kontrol edin.",
    "admin-restricted-operation": "Bu işlem Firebase tarafında kısıtlanmış.",
  };
  if (map[code]) return map[code];
  const msg = e instanceof Error ? e.message : String(e || '');
  const clean = msg.replace('Firebase: ', '').replace(/\(auth[^)]*\)\.?/, '').trim();
  if (clean && clean.toLowerCase() !== 'error') return clean;
  // Asla çıplak "Error" göstermeyelim — varsa hata kodunu da yazalım.
  return code ? `Beklenmeyen bir hata oluştu (kod: auth/${code}).` : 'Beklenmeyen bir hata oluştu.';
}
