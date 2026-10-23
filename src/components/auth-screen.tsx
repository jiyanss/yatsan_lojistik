'use client';
// ============================================================
// Giriş / Kayıt ekranı
// ============================================================
import { useState, type FormEvent } from 'react';
import { fbErr } from '@/lib/constants';
import { DEMO_ACCOUNT } from '@/lib/demo-data';
import { resetPassword, signIn, signUp } from '@/lib/db';
import { FIREBASE_ENV_KEYS, getFirebaseConfig, type FirebaseConfig } from '@/lib/firebase';
import { useToast } from './toast';
import Icon from './Icon';

const ENV_KEY_TO_CFG: Record<(typeof FIREBASE_ENV_KEYS)[number], keyof FirebaseConfig> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'apiKey',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'authDomain',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'projectId',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'storageBucket',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'appId',
};

export default function AuthScreen({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const cfg = getFirebaseConfig();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (tab === 'signup') await signUp(email, password, name.trim() || undefined);
      else await signIn(email, password);
    } catch (ex) {
      setErr(fbErr(ex));
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin() {
    try { await signIn(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password); }
    catch (ex) { toast(fbErr(ex), 'error'); }
  }

  async function forgot() {
    const mail = window.prompt('Şifre sıfırlama bağlantısı gönderilecek e-posta adresi:');
    if (!mail) return;
    try {
      await resetPassword(mail);
      toast('Şifre sıfırlama bağlantısı e-postanıza gönderildi.');
    } catch (ex) {
      toast(fbErr(ex), 'error');
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="mark">Y</div>
          <div className="brand">YATSAN</div>
          <div className="sub">İç Lojistik Planlama Sistemi</div>
        </div>

        {isDemoMode && (
          <div className="note warn" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={16} />
            <span>
              <b>Demo modu aktif.</b> Firebase yapılandırması girilmediği için veriler bu tarayıcıda saklanıyor.
              Canlıya geçiş için <b>NEXT_PUBLIC_FIREBASE_*</b> ortam değişkenlerini tanımlayın.
            </span>
          </div>
        )}

        {isDemoMode && (
          <div style={{ marginBottom: 16, border: '1px solid #d8e0ea', borderRadius: 10, padding: '10px 12px', fontSize: 12, background: '#f6f8fb' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Teşhis — bu derlemede algılanan ortam değişkenleri</div>
            {FIREBASE_ENV_KEYS.map((k) => {
              const v = (cfg[ENV_KEY_TO_CFG[k]] || '') as string;
              const ok = v.length > 0;
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '2px 0' }}>
                  <span>{k.replace('NEXT_PUBLIC_FIREBASE_', '')}</span>
                  <span style={{ color: ok ? '#1a7f37' : '#c62828', fontWeight: 700 }}>
                    {ok ? `✔ girildi · ${v.length} karakter` : '✖ BOŞ'}
                  </span>
                </div>
              );
            })}
            <div style={{ marginTop: 8, opacity: 0.85, lineHeight: 1.5 }}>
              Hepsinin <b>✔</b> olması gerekir. <b>BOŞ</b> görünen varsa: Vercel → Settings → Environment Variables → <b>Project</b> sekmesinden yazımı kontrol edin, ardından <b>cache’siz</b> yeniden derleyin (Deployments → ⋯ → Redeploy → Use existing Build Cache kapalı).
            </div>
          </div>
        )}

        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setErr(null); }}>Giriş Yap</button>
          <button className={tab === 'signup' ? 'active' : ''} onClick={() => { setTab('signup'); setErr(null); }}>Kayıt Ol</button>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          {tab === 'signup' && (
            <div className="field">
              <label>Ad Soyad</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Ahmet Yılmaz" autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label>E-posta <span className="req">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad.soyad@yatsan.local" autoComplete="email" required />
          </div>
          <div className="field">
            <label>Şifre <span className="req">*</span></label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="En az 6 karakter" autoComplete="current-password" required minLength={6} />
          </div>
          {err && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</div>}
          <button className="btn wide" type="submit" disabled={busy}>
            {busy ? (tab === 'signup' ? 'Kayıt yapılıyor…' : 'Giriş yapılıyor…') : tab === 'signup' ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </form>

        {isDemoMode && (
          <button className="btn secondary wide" style={{ marginTop: 10 }} onClick={demoLogin}>
            <Icon name="key" size={15} /> Demo hesabıyla gir <small style={{ opacity: 0.7 }}>(demo@yatsan.local)</small>
          </button>
        )}

        <div className="auth-foot">
          <a href="#" onClick={(e) => { e.preventDefault(); void forgot(); }}>Şifremi unuttum</a>
          {' · '}
          {isDemoMode ? 'Veriler yalnızca bu tarayıcıda tutulur' : 'Yetkilendirme Firebase Auth ile sağlanır'}
        </div>
      </div>
    </div>
  );
}
