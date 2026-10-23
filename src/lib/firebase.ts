// ============================================================
// FIREBASE YAPILANDIRMASI — Ortam Değişkenleri ile
// ------------------------------------------------------------
// Bu sürümde config KOD İÇİNDE DEĞİLDİR. Değerler ortam
// değişkenlerinden okunur (Next.js build zamanında gömer):
//
//   NEXT_PUBLIC_FIREBASE_API_KEY=...
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
//   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
//   NEXT_PUBLIC_FIREBASE_APP_ID=...
//
// • Vercel: Project Settings → Environment Variables
// • Lokal (isterseniz): .env.local dosyası
// Değişkenler girilmediyse uygulama otomatik DEMO moduna düşer
// (veriler tarayıcı localStorage'ında tutulur).
// ============================================================

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const env = (k: string): string => {
  try { return (process.env[k] as string) || ''; } catch { return ''; }
};

export function getFirebaseConfig(): FirebaseConfig {
  return {
    apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: env('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('NEXT_PUBLIC_FIREBASE_APP_ID'),
  };
}

export const FIREBASE_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

/** Yapılandırma girilmiş mi? */
export function isFirebaseConfigured(): boolean {
  const c = getFirebaseConfig();
  return Boolean(c.apiKey && c.projectId && c.appId);
}

// ---- SDK (npm paketi) — yalnızca Firebase modunda yüklenir ----
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth, type Auth,
} from 'firebase/auth';
import {
  getFirestore, type Firestore,
} from 'firebase/firestore';

export interface FbContext {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let fb: FbContext | null = null;

/** Firebase SDK'yı başlatır ve bağlamı döndürür. */
export function ensureFirebase(): FbContext {
  if (fb) return fb;
  const cfg = getFirebaseConfig();
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  fb = { app, auth: getAuth(app), db: getFirestore(app) };
  return fb;
}
