'use client';
// ============================================================
// Uygulama kabuğu: sidebar + topbar
// ============================================================
import { fmtDate } from '@/lib/format';
import { roleLabel } from '@/lib/constants';
import type { UserProfile } from '@/lib/types';
import Icon from './Icon';

export interface NavItem { id: string; label: string; icon: string; minRole?: 'admin'; }
export interface NavGroup { group: string; items: NavItem[]; }

export const NAV: NavGroup[] = [
  {
    group: 'Genel',
    items: [{ id: 'ozet', label: 'Özet', icon: 'gauge' }],
  },
  {
    group: 'Operasyon',
    items: [
      { id: 'talepler', label: 'Araç Talepleri', icon: 'clipboard' },
      { id: 'rotalar', label: 'Rota Planlama', icon: 'route' },
      { id: 'takip', label: 'Araç Takip', icon: 'mappin' },
      { id: 'sevkiyatlar', label: 'Sevkiyatlar', icon: 'package' },
    ],
  },
  {
    group: 'Tanımlar',
    items: [
      { id: 'istasyonlar', label: 'İstasyonlar & Mesafeler', icon: 'mappin' },
      { id: 'araclar', label: 'Araçlar', icon: 'truck' },
    ],
  },
  {
    group: 'Yönetim',
    items: [
      { id: 'raporlar', label: 'Raporlar', icon: 'chart' },
      { id: 'kullanicilar', label: 'Kullanıcılar', icon: 'users', minRole: 'admin' },
      { id: 'ayarlar', label: 'Ayarlar', icon: 'settings', minRole: 'admin' },
    ],
  },
];

export const TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.id, i.label]),
);
export const findNav = (id: string): NavItem | undefined => NAV.flatMap((g) => g.items).find((i) => i.id === id);

export function initials(name: string): string {
  return (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');
}

export function Sidebar({ user, route, navigate, demoMode }: {
  user: UserProfile; route: string; navigate: (id: string) => void; demoMode: boolean;
}) {
  return (
    <>
      <div className="sidebar-overlay" id="sidebar-overlay" onClick={() => document.getElementById('shell')?.classList.remove('side-open')} />
      <aside className="sidebar">
        <div className="side-brand">
          <div className="mark">Y</div>
          <div>
            <div className="t1">YATSAN</div>
            <div className="t2">İç Lojistik Planlama</div>
          </div>
        </div>
        {NAV.map((g) => (
          <div className="side-group" key={g.group}>
            <div className="gtitle">{g.group}</div>
            {g.items
              .filter((i) => !i.minRole || i.minRole === user.role)
              .map((i) => (
                <button
                  key={i.id}
                  className={`side-nav ${route === i.id ? 'active' : ''}`}
                  data-nav={i.id}
                  onClick={() => navigate(i.id)}
                >
                  <Icon name={i.icon} size={17} />
                  <span>{i.label}</span>
                </button>
              ))}
          </div>
        ))}
        <div className="side-fill" />
        <div className="side-user">
          <div className="uname">{user.displayName || user.email}</div>
          {roleLabel(user.role)}{demoMode ? ' · Demo modu' : ' · Firebase bağlı'}
        </div>
      </aside>
    </>
  );
}

export function Topbar({ user, route, demoMode, onLogout }: {
  user: UserProfile; route: string; demoMode: boolean; onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <button className="burger" aria-label="Menü" onClick={() => document.getElementById('shell')?.classList.toggle('side-open')}>
        <Icon name="menu" size={18} />
      </button>
      <div className="title">{TITLES[route] || 'Yatsan'}</div>
      <div className="spacer" />
      {demoMode && (
        <span className="demo-chip" title="Firebase yapılandırması girilmedi — veriler bu tarayıcıda tutuluyor">
          <Icon name="alert" size={13} /><span>DEMO</span>
        </span>
      )}
      <span className="today">{fmtDate(new Date().toISOString())}</span>
      <div className="uchip">
        <div className="avatar">{initials(user.displayName || user.email || '?')}</div>
        <div className="meta">
          <div className="n">{user.displayName || user.email}</div>
          <div className="r">{roleLabel(user.role)}</div>
        </div>
      </div>
      <button className="logout" title="Çıkış yap" aria-label="Çıkış yap" onClick={onLogout}>
        <Icon name="logout" size={16} />
      </button>
    </header>
  );
}
