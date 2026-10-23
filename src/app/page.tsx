'use client';
// ============================================================
// Yatsan İç Lojistik Planlama — ana uygulama
// Giriş ekranı + kabuk + hash router (#/ozet, #/talepler, ...)
// AppErrorBoundary: beklenmeyen bir render hatası tüm siteyi değil,
// Türkçe açıklamalı kurtarma ekranını gösterir (beyaz ekran / Vercel
// hatası yerine).
// ============================================================
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '@/lib/types';
import { getMode, initDB, onAuth, signOutUser } from '@/lib/db';
import { findNav, Sidebar, Topbar } from '@/components/shell';
import AuthScreen from '@/components/auth-screen';
import SoforPanel from '@/components/sofor-panel';
import { ToastProvider } from '@/components/toast';
import DashboardView from '@/views/dashboard';
import RequestsView from '@/views/requests';
import RoutesView from '@/views/routes';
import TakipView from '@/views/takip';
import ShipmentsView from '@/views/shipments';
import StationsView from '@/views/stations';
import VehiclesView from '@/views/vehicles';
import ReportsView from '@/views/reports';
import UsersView from '@/views/users';
import SettingsView from '@/views/settings';
import { useHashRoute } from '@/hooks/useData';
import type { ViewCtx } from '@/views/context';

class AppErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('Uygulama hatası:', err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Bir şeyler ters gitti</h1>
          <p style={{ fontSize: 13.5, color: '#5d6f84', lineHeight: 1.6 }}>
            Sayfa beklenmeyen bir hata nedeniyle durdu. Aşağıdaki düğmeyle yenileyin;
            sorun sürüyorsa yöneticinize bu mesajı iletin:
          </p>
          <pre style={{ fontSize: 11, background: '#f2f5f9', padding: 10, borderRadius: 8, overflow: 'auto', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
            {this.state.err.message}
          </pre>
          <button onClick={() => window.location.reload()}
            style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer', marginTop: 6 }}>
            Sayfayı yenile
          </button>
        </div>
      </main>
    );
  }
}

export default function Home() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}

function AppInner() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<'demo' | 'firebase'>('demo');
  const [route, navigate] = useHashRoute();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    initDB().then((m) => {
      if (!mounted) return;
      setMode(m);
      onAuth((u) => setUser(u));
      setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  // geçersiz / yetkisiz rotayı özete çevir
  const activeRoute = useMemo(() => {
    if (!user) return route;
    const item = findNav(route);
    if (!item) return 'ozet';
    if (item.minRole && item.minRole !== user.role) return 'ozet';
    return route;
  }, [route, user]);

  useEffect(() => {
    document.getElementById('shell')?.classList.remove('side-open');
  }, [activeRoute]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const canEdit = !!user && (user.role === 'admin' || user.role === 'planlayici');
  const isAdmin = !!user && user.role === 'admin';

  const logout = useCallback(async () => {
    await signOutUser();
    window.location.hash = '';
    setUser(null);
  }, []);

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5d6f84', fontSize: 13 }}>
        Yükleniyor…
      </main>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        <AuthScreen isDemoMode={mode === 'demo'} />
      </ToastProvider>
    );
  }

  // Şoför yalnızca mobil paneli görür — masaüstü kabuğuna hiç girmez.
  if (user.role === 'sofor') {
    return (
      <ToastProvider>
        <SoforPanel user={user} onLogout={logout} />
      </ToastProvider>
    );
  }

  const ctx: ViewCtx = { user, canEdit, isAdmin, navigate, refresh, demoMode: mode === 'demo' };

  return (
    <ToastProvider>
      <div className="shell" id="shell">
        <Sidebar user={user} route={activeRoute} navigate={navigate} demoMode={mode === 'demo'} />
        <div className="main">
          <Topbar user={user} route={activeRoute} demoMode={mode === 'demo'} onLogout={logout} />
          <main className="page" id="page">
            <ViewSwitch route={activeRoute} ctx={ctx} refreshKey={refreshKey} />
          </main>
        </div>
      </div>
      <div id="print-root" />
    </ToastProvider>
  );
}

function ViewSwitch({ route, ctx, refreshKey }: {
  route: string;
  ctx: ViewCtx;
  refreshKey: number;
}) {
  switch (route) {
    case 'talepler': return <RequestsView key={refreshKey} ctx={ctx} />;
    case 'rotalar': return <RoutesView key={refreshKey} ctx={ctx} />;
    case 'takip': return <TakipView key={refreshKey} ctx={ctx} />;
    case 'sevkiyatlar': return <ShipmentsView key={refreshKey} ctx={ctx} />;
    case 'istasyonlar': return <StationsView key={refreshKey} ctx={ctx} />;
    case 'araclar': return <VehiclesView key={refreshKey} ctx={ctx} />;
    case 'raporlar': return <ReportsView key={refreshKey} ctx={ctx} />;
    case 'kullanicilar': return <UsersView key={refreshKey} ctx={ctx} />;
    case 'ayarlar': return <SettingsView key={refreshKey} ctx={ctx} />;
    default: return <DashboardView key={refreshKey} ctx={ctx} />;
  }
}
