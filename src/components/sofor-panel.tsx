'use client';
// ============================================================
// ŞOFÖR MOBİL PANELİ — sabit hat araçları için
// Şoför giriş yapınca doğrudan bu paneli görür (masaüstü kabuğu yok).
//   • Kendine atanan görevleri görür (hangi istasyondan → hangi istasyona)
//   • Pin basar: Çıktım → Vardım (yer dolu/boş) → İş tamam
//   • İstasyon çağrıları da aynı panelde görünür
// ============================================================
import { useMemo, useState } from 'react';
import { createGorev, distanceBetween, gorevPin, OPEN_GOREV_DURUMLARI, today } from '@/lib/db';
import { fbErr, GOREV_TIP, PIN_LABEL } from '@/lib/constants';
import { fmtDT, fmtKm } from '@/lib/format';
import type { Distance, Gorev, GorevDurum, PinTip, UserProfile } from '@/lib/types';
import Icon from './Icon';
import { useToast } from './toast';
import { useCollection } from '@/hooks/useData';
import { Note } from './ui';

export default function SoforPanel({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const toast = useToast();
  const vehicles = useCollection('vehicles');
  const gorevler = useCollection('gorevler');
  const stations = useCollection('stations');
  const distances = useCollection('distances');
  const [busy, setBusy] = useState<string | null>(null);

  const vehicle = (vehicles || []).find((v) => v.id === user.vehicleId) || null;
  const stName = (id?: string | null) => (stations || []).find((s) => s.id === id)?.name || '—';
  const kmOf = (g: Gorev) => distanceBetween((distances || []) as Distance[], g.fromId, g.toId);

  const mine = useMemo(
    () => (gorevler || []).filter((g) => g.vehicleId === user.vehicleId),
    [gorevler, user.vehicleId],
  );
  const open = mine
    .filter((g) => OPEN_GOREV_DURUMLARI.includes(g.durum))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const doneToday = mine
    .filter((g) => g.durum === 'TAMAMLANDI' && (g.updatedAt || '').slice(0, 10) === today())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  async function pin(g: Gorev, tip: PinTip, durum: GorevDurum) {
    setBusy(g.id || 'x');
    try {
      await gorevPin(g, tip, durum, user.displayName);
      toast('Pin atıldı: ' + PIN_LABEL[tip]);
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  async function turBaslat(dolu: boolean) {
    if (!vehicle?.sabitFromId || !vehicle?.sabitToId) return;
    setBusy('yeni');
    try {
      await createGorev({
        vehicleId: vehicle.id, tip: 'HAT',
        fromId: vehicle.sabitFromId, toId: vehicle.sabitToId,
        dolu, soforUid: user.uid, soforAd: user.displayName,
      });
      toast(dolu ? 'Dolu tur açıldı — iyi işler!' : 'Boş tur açıldı');
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  const hatKm = vehicle ? distanceBetween((distances || []) as Distance[], vehicle.sabitFromId, vehicle.sabitToId) : null;
  const sabitHatVar = !!(vehicle?.sabitFromId && vehicle?.sabitToId);
  const hatAcik = open.some((g) => g.tip === 'HAT');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f2f5f9)', paddingBottom: 28 }}>
      {/* Üst başlık */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #1e40af)', color: '#fff', padding: '18px 16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>Y</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: .3 }}>YATSAN</div>
              <div style={{ fontSize: 10.5, opacity: .8 }}>Şoför Paneli</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{user.displayName}</div>
              <div style={{ fontSize: 10.5, opacity: .8 }}>{user.email}</div>
            </div>
            <button aria-label="Çıkış yap" onClick={onLogout}
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>

        {vehicle ? (
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800 }}>
              <Icon name="truck" size={17} />
              {vehicle.code}{vehicle.name ? ` · ${vehicle.name}` : ''}
            </div>
            {sabitHatVar ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 13, fontWeight: 700 }}>
                  <Icon name="mappin" size={14} />
                  <span>{stName(vehicle.sabitFromId)}</span>
                  <Icon name="arrowRight" size={14} />
                  <span>{stName(vehicle.sabitToId)}</span>
                </div>
                {hatKm != null && (
                  <div style={{ fontSize: 11, opacity: .85, marginTop: 4 }}>Tek yön: {fmtKm(hatKm)}</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11.5, opacity: .85, marginTop: 5 }}>
                Sabit hat tanımlı değil — yöneticiniz araca sabit hat atamalı.
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>
            Henüz araca atanmadınız. Yöneticiniz Kullanıcılar sayfasından sizi bir araca atamalı.
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 14px 0' }}>
        {/* Açık görevler */}
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '6px 0 8px' }}>
          Atanan işlerim {open.length > 0 && `(${open.length})`}
        </div>

        {!vehicle ? (
          <Note type="warn">
            Araç ataması yapılmadı. Yönetici <b>Kullanıcılar</b> sayfasından rolünüzü <b>Şoför</b> yapıp bir araç atamalı.
          </Note>
        ) : open.length === 0 ? (
          <div className="card"><div className="card-body" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Şu an açık göreviniz yok. Aşağıdan sabit hat turu başlatabilirsiniz; istasyon çağrısı geldiğinde burada belirecek.
          </div></div>
        ) : (
          open.map((g) => (
            <GorevCard key={g.id} g={g} busy={busy === g.id} stName={stName} km={kmOf(g)} onPin={pin} />
          ))
        )}

        {/* Sabit hat turu başlat */}
        {vehicle && sabitHatVar && !hatAcik && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Yeni sabit hat turu
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn" style={{ padding: '15px 14px', fontSize: 15, fontWeight: 800, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' }}
                disabled={busy === 'yeni'} onClick={() => turBaslat(true)}>
                Dolu tur başlat — {stName(vehicle.sabitFromId)} → {stName(vehicle.sabitToId)}
              </button>
              <button className="btn secondary" style={{ padding: '15px 14px', fontSize: 14, fontWeight: 700, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' }}
                disabled={busy === 'yeni'} onClick={() => turBaslat(false)}>
                Boş tur başlat (yüksüz hareket)
              </button>
            </div>
          </div>
        )}

        {/* Bugün özet + geçmiş */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '0 0 8px' }}>
            Bugün — {doneToday.length} tur tamamlandı
          </div>
          {doneToday.length === 0 ? (
            <div className="card"><div className="card-body" style={{ fontSize: 12.5, color: 'var(--muted)' }}>Bugün tamamlanan tur yok.</div></div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {doneToday.slice(0, 8).map((g) => (
                <div key={g.id} className="card"><div className="card-body" style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="checkCircle" size={14} />
                      {stName(g.fromId)} → {stName(g.toId)}
                    </span>
                    <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{g.updatedAt ? fmtDT(g.updatedAt) : ''}</span>
                  </div>
                  {g.pins && g.pins.length > 0 && (
                    <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
                      {g.pins.map((p, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>• {PIN_LABEL[p.tip] || p.tip}</span>
                          <span>{new Date(p.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tek görev kartı + pin butonları ---------------- */
function GorevCard({ g, busy, stName, km, onPin }: {
  g: Gorev;
  busy: boolean;
  stName: (id?: string | null) => string;
  km: number | null;
  onPin: (g: Gorev, tip: PinTip, durum: GorevDurum) => void;
}) {
  const cagri = g.tip === 'CAGRI';
  const yon = cagri
    ? `${stName(g.toId)} istasyonuna gidilecek`
    : `${stName(g.fromId)} → ${stName(g.toId)}`;
  const btnStyle: React.CSSProperties = { padding: '14px 12px', fontSize: 14.5, fontWeight: 800, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' };
  return (
    <div className="card" style={{ marginBottom: 10, border: cagri ? '2px solid #f59e0b' : undefined }}>
      <div className="card-body" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge type-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name={cagri ? 'alert' : 'route'} size={12} />
            {GOREV_TIP[g.tip] || g.tip}
          </span>
          <span className="badge" style={{
            background: g.dolu ? '#dcfce7' : '#e0e7ff', color: g.dolu ? '#166534' : '#3730a3',
            fontWeight: 800, fontSize: 11,
          }}>{g.dolu ? 'DOLU GİDİYOR' : 'BOŞ GİDİYOR'}</span>
        </div>

        <div style={{ fontSize: 15.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.35 }}>
          <Icon name="mappin" size={15} />{yon}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {km != null && <span>Mesafe: {fmtKm(km)}</span>}
          <span>Atandı: {g.createdAt ? fmtDT(g.createdAt) : '—'}</span>
        </div>
        {g.not && <div style={{ fontSize: 12, marginTop: 5, color: 'var(--muted)' }}>Not: {g.not}</div>}

        {/* Pin geçmişi */}
        {g.pins && g.pins.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {g.pins.slice(1).map((p, i) => (
              <span key={i} style={{ fontSize: 10.5, background: '#eef2f7', borderRadius: 20, padding: '3px 8px', color: '#44566c', fontWeight: 600 }}>
                {PIN_LABEL[p.tip] || p.tip} · {new Date(p.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ))}
          </div>
        )}

        {/* Duruma göre pin butonları */}
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {g.durum === 'YENI' && (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'CIKTIM', 'YOLDA')}>
              <Icon name="truck" size={17} /> Çıktım — Yola çıktım
            </button>
          )}
          {g.durum === 'YOLDA' && (g.dolu ? (
            <>
              <button className="btn" style={{ ...btnStyle, background: '#dc2626' }} disabled={busy} onClick={() => onPin(g, 'VARDIM_DOLU', 'BEKLIYOR')}>
                <Icon name="clock" size={17} /> Vardım — Dolu, indirme bekliyorum
              </button>
              <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'VARDIM_BOS', 'ISTASYONDA')}>
                <Icon name="checkCircle" size={17} /> Vardım — Yer boş
              </button>
            </>
          ) : (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'ISTASYONDA', 'ISTASYONDA')}>
              <Icon name="checkCircle" size={17} /> Vardım — İstasyonda oldum
            </button>
          ))}
          {g.durum === 'BEKLIYOR' && (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
              <Icon name="check" size={17} /> İndirme tamam — İş bitti
            </button>
          )}
          {g.durum === 'ISTASYONDA' && (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
              <Icon name="check" size={17} /> İş bitti
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
