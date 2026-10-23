'use client';
// ============================================================
// Yatsan İç Lojistik Planlama — ana uygulama
// Giriş ekranı + kabuk + hash router (#/ozet, #/talepler, ...)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/lib/types';
import { getMode, initDB, onAuth, signOutUser } from '@/lib/db';
import { findNav, Sidebar, Topbar } from '@/components/shell';
import AuthScreen from '@/components/auth-screen';
import { ToastProvider } from '@/components/toast';
import DashboardView from '@/views/dashboard';
import RequestsView from '@/views/requests';
import RoutesView from '@/views/routes';
import ShipmentsView from '@/views/shipments';
import StationsView from '@/views/stations';
import VehiclesView from '@/views/vehicles';
import ReportsView from '@/views/reports';
import UsersView from '@/views/users';
import SettingsView from '@/views/settings';
import { useHashRoute } from '@/hooks/useData';
import type { ViewCtx } from '@/views/context';

export default function Home() {
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
    case 'sevkiyatlar': return <ShipmentsView key={refreshKey} ctx={ctx} />;
    case 'istasyonlar': return <StationsView key={refreshKey} ctx={ctx} />;
    case 'araclar': return <VehiclesView key={refreshKey} ctx={ctx} />;
    case 'raporlar': return <ReportsView key={refreshKey} ctx={ctx} />;
    case 'kullanicilar': return <UsersView key={refreshKey} ctx={ctx} />;
    case 'ayarlar': return <SettingsView key={refreshKey} ctx={ctx} />;
    default: return <DashboardView key={refreshKey} ctx={ctx} />;
  }
}
