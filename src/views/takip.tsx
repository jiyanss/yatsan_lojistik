'use client';
// ============================================================
// ARAÇ TAKİP — canlı araç durumları + istasyon araç çağırma
//   • Her araç: boşta / yolda / istasyonda / dolu bekliyor
//   • Şoförün bastığı pinler canlı görünür
//   • İstasyon ihtiyacında görev, çağıran istasyona EN YAKIN boşta araca otomatik düşer (veya yönetici elle atar)
// ============================================================
import { useMemo, useState } from 'react';
import { createGorev, enKisaKm, aracinStasyonu, gorevPin, isBosArac, istasyondanAracCagir, paydosAktif, OPEN_GOREV_DURUMLARI, today } from '@/lib/db';
import { fbErr, GOREV_DURUM, MOLA_TIP, PIN_LABEL } from '@/lib/constants';
import { fmtDT, fmtKm } from '@/lib/format';
import type { Distance, Gorev, RoutePlan, UserProfile, Vehicle } from '@/lib/types';
import Icon from '@/components/Icon';
import { EmptyState, GorevDurumBadge, GorevTipBadge, Modal, VehicleStatusBadge, Note, confirmDialog, renderOpts } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function TakipView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const data = useCollections(['vehicles', 'gorevler', 'stations', 'users', 'distances', 'routes']);
  const [cagriOpen, setCagriOpen] = useState(false);
  const [gorevVer, setGorevVer] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

  const vehicles = (data?.vehicles || null) as Vehicle[] | null;
  const gorevler = (data?.gorevler || []) as Gorev[];
  const stations = (data?.stations || []) as { id: string; code: string; name: string }[];
  const users = (data?.users || []) as (UserProfile & { uid: string })[];
  const distances = (data?.distances || []) as Distance[];
  const routes = (data?.routes || []) as RoutePlan[];

  const stName = (id?: string | null) => {
    const s = stations.find((x) => x.id === id);
    return s ? `${s.code} · ${s.name}` : '—';
  };
  const kmOf = (g: Gorev) => {
    const hit = distances.find((d) =>
      (d.fromId === g.fromId && d.toId === g.toId) || (d.fromId === g.toId && d.toId === g.fromId));
    return hit ? hit.meters : null;
  };
  const soforAd = (vehicleId: string) =>
    users.find((u) => u.role === 'sofor' && u.vehicleId === vehicleId)?.displayName || null;

  /** Şoförün vardiya pininden: "Çay molasında", "Beklemede — X (boş)", "Paydos verdi", "İş başı yaptı" */
  const vardiyaDurumYaz = (v: Vehicle): string => {
    const k = v.gunluk?.[today()];
    if (!k) return '';
    const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const acik = (k.molalar || []).find((m) => !m.t);
    if (acik) {
      if (acik.tip === 'BEKLEME') {
        const s = stations.find((x) => x.id === acik.ist);
        return `Beklemede — ${s ? s.code : '?'} (${acik.dolu ? 'dolu' : 'boş'}) · ${saat(acik.b)}'den beri`;
      }
      return `${MOLA_TIP[acik.tip] || acik.tip}da · ${saat(acik.b)}'den beri`;
    }
    if (paydosAktif(k)) return `Paydos verdi · ${saat(k.paydos!)}`;
    if (k.isbasi && (!k.paydos || k.isbasi > k.paydos)) return `İş başı yaptı · ${saat(k.isbasi)}`;
    return '';
  };

  const openGorev = (vehicleId: string) =>
    gorevler.find((g) => g.vehicleId === vehicleId && OPEN_GOREV_DURUMLARI.includes(g.durum)) || null;

  const sorted = useMemo(() => {
    if (!vehicles) return [];
    return [...vehicles].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr'));
  }, [vehicles]);

  if (!vehicles) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  const aktif = sorted.filter((v) => v.status === 'AKTIF');
  // Görevi görünmeyen şoförler: hesabına araç atanmamış (veya atanmış araç kaydı bozulmuş) şoförler
  // araç kartlarında hiç yer almadığı için burada ayrıca listelenir — yoksa "sistem görmüyor" sanılır.
  const sahipsizSoforler = users.filter((u) =>
    u.role === 'sofor' && (!u.vehicleId || !vehicles.some((v) => v.id === u.vehicleId)));
  const bozukAracVar = vehicles.some((v) => !v.code);
  const bosSayi = aktif.filter((v) => isBosArac(v.id, gorevler)).length;
  const yoldaSayi = aktif.filter((v) => ['YOLDA', 'DONUS_YOLDA'].includes(openGorev(v.id)?.durum || '')).length;
  const istasyondaSayi = aktif.filter((v) => ['ISTASYONDA', 'BEKLIYOR'].includes(openGorev(v.id)?.durum || '')).length;
  const yeniSayi = aktif.filter((v) => openGorev(v.id)?.durum === 'YENI').length;

  const bugunHareket = [...gorevler]
    .filter((g) => (g.updatedAt || g.createdAt || '').slice(0, 10) === today())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 15);

  async function cagriYap(stationId: string, vehicleId: string | null) {
    if (!stationId) { toast('Çağıran istasyonu seçin.', 'error'); return; }
    setBusy(true);
    try {
      const r = await istasyondanAracCagir(stationId, vehicleId, ctx.user.displayName);
      if (r === 'BOS_YOK') toast('Boşta araç yok — bir görev bitince tekrar deneyin.', 'error');
      else {
        const v = vehicles?.find((x) => x.id === r.vehicleId);
        toast(`Görev düşürüldü → ${v?.code || 'araç'} (${stName(stationId)})`);
        setCagriOpen(false);
      }
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  async function goreviIptal(g: Gorev) {
    const ok = await confirmDialog(
      <><b>{stName(g.fromId)} → {stName(g.toId)}</b> görevi iptal edilecek. Şoför panelinden kaybolur.</>,
      { danger: true, okText: 'Evet, iptal et', title: 'Görevi iptal et' },
    );
    if (!ok) return;
    try { await gorevPin(g, 'IPTAL', 'IPTAL', ctx.user.displayName); toast('Görev iptal edildi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }

  async function goreviKapat(g: Gorev) {
    try { await gorevPin(g, 'TAMAM', 'TAMAMLANDI', ctx.user.displayName); toast('Görev tamamlandı işaretlendi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }

  return (
    <>
      <Note type="info">
        Şoförler mobil panellerinden pinleri basar: <b>Dolu yola çıktım → Vardım dolu → Hedef istasyona yola çıktım →
        Hedef istasyona vardım → Yükleme tamam</b>; durumlar burada anında görünür. İstasyon bir araç istediğinde görev
        <b> çağıran istasyona en yakın boşta araca</b> otomatik düşer; dilerseniz aracı elle de seçebilirsiniz.
        {bozukAracVar && <> <b style={{ color: '#b45309' }}>Dikkat:</b> kodu boş görünen araçlar eski bir yazım hatasından
        bozulmuştur — <b>Araçlar</b> sayfasından Düzenle ile bilgilerini yeniden girin (aynı kayıt onarılır, geçmiş bağlantıları korunur).</>}
      </Note>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge st-tamamlandi">Boşta: {bosSayi}</span>
          <span className="badge st-beklemede">Yeni görev: {yeniSayi}</span>
          <span className="badge st-planlandi">Yolda: {yoldaSayi}</span>
          <span className="badge st-onaylandi">İstasyonda: {istasyondaSayi}</span>
        </div>
        <span className="spacer" />
        {ctx.canEdit && (
          <button className="btn" onClick={() => setCagriOpen(true)}>
            <Icon name="mappin" size={15} /> İstasyondan Araç Çağır
          </button>
        )}
      </div>

      {!sorted.length ? (
        <div className="card"><div className="card-body">
          <EmptyState ico="truck" title="Araç yok" desc="Önce Araçlar sayfasından araç tanımlayın." />
        </div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {sorted.map((v) => {
            const g = openGorev(v.id);
            const bos = v.status === 'AKTIF' && !g;
            const lastPin = g?.pins?.[g.pins.length - 1];
            return (
              <div className="card" key={v.id} style={{ opacity: v.status === 'PASIF' ? .6 : 1 }}>
                <div className="card-body" style={{ padding: '13px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Icon name="truck" size={15} />{v.code || <span style={{ color: '#b45309' }}>(kod yok)</span>}
                        <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>{v.name}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        {soforAd(v.id) ? `Şoför: ${soforAd(v.id)}` : 'Şoför ataması yok'}
                      </div>
                      {vardiyaDurumYaz(v) && (
                        <div style={{ fontSize: 11.5, marginTop: 3, fontWeight: 700, color: '#92400e' }}>
                          {vardiyaDurumYaz(v)}
                        </div>
                      )}
                    </div>
                    {bos ? <span className="badge st-tamamlandi">Boşta</span>
                      : v.status !== 'AKTIF' ? <VehicleStatusBadge s={v.status} />
                      : <GorevDurumBadge s={g!.durum} />}
                  </div>

                  {(v.sabitFromId || v.sabitToId) && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="route" size={13} />
                      Sabit hat: {stName(v.sabitFromId)} → {stName(v.sabitToId)}
                    </div>
                  )}

                  {g && (
                    <div style={{ marginTop: 10, background: 'var(--bg-soft, #f6f8fb)', borderRadius: 10, padding: '9px 11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                        <GorevTipBadge t={g.tip} />
                        {kmOf(g) != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtKm(kmOf(g))}</span>}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="mappin" size={13} />
                        {g.tip === 'CAGRI' ? `${stName(g.toId)} çağrısı` : `${stName(g.fromId)} → ${stName(g.toId)}`}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        {g.durum === 'YOLDA' ? 'Yolda — ' : g.durum === 'DONUS_YOLDA' ? `${stName(g.fromId)} · dönüşte (boş) — ` : g.durum === 'BEKLIYOR' ? `${stName(g.toId)} · dolu bekliyor — ` : g.durum === 'ISTASYONDA' ? `${stName(g.toId)} · istasyonda — ` : g.durum === 'YENI' ? 'Henüz çıkmadı — ' : ''}
                        Son pin: {lastPin ? `${PIN_LABEL[lastPin.tip] || lastPin.tip} (${fmtDT(lastPin.at)})` : '—'}
                      </div>
                      {ctx.canEdit && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {g && (
                            <>
                              <button className="btn sm secondary" onClick={() => goreviKapat(g)}><Icon name="check" size={12} /> Tamamlandı</button>
                              <button className="btn sm danger-ghost" onClick={() => goreviIptal(g)}><Icon name="ban" size={12} /> İptal</button>
                            </>
                          )}
                          {!g && v.status === 'AKTIF' && (
                            <button className="btn sm" onClick={() => setGorevVer(v)}><Icon name="plus" size={12} /> Görev Ver</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sahipsizSoforler.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-body" style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="users" size={15} /> Araç atanmamış şoförler ({sahipsizSoforler.length})
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', margin: '5px 0 9px' }}>
              Bu şoförlerin hiçbir görevi görünmez çünkü hesaplarına araç atanmamış (veya atanmış olan aracın kaydı bozulmuş).
              <b> Kullanıcılar</b> sayfasından araç atayın — atanınca yukarıda kart olarak görünür.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sahipsizSoforler.map((u) => (
                <span key={u.uid} className="badge st-beklemede" style={{ fontSize: 12 }}>
                  {u.displayName || u.email}{u.vehicleId ? ' · aracı bozuk' : ' · araç yok'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bugünün hareketleri */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-body flush">
          <div style={{ padding: '12px 14px 0', fontWeight: 800, fontSize: 13.5 }}>Bugünün Hareketleri</div>
          {bugunHareket.length === 0 ? (
            <div style={{ padding: '10px 14px 14px', fontSize: 12.5, color: 'var(--muted)' }}>Bugün kayıtlı hareket yok.</div>
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr>
                <th>Araç</th><th>Hareket</th><th>Tip</th><th>Durum</th><th>Son pin</th><th>Saat</th>
              </tr></thead>
              <tbody>
                {bugunHareket.map((g) => {
                  const v = vehicles.find((x) => x.id === g.vehicleId);
                  const lastPin = g.pins?.[g.pins.length - 1];
                  return (
                    <tr key={g.id}>
                      <td><b>{v?.code || '—'}</b></td>
                      <td>{g.tip === 'CAGRI' ? `${stName(g.toId)} çağrısı` : `${stName(g.fromId)} → ${stName(g.toId)}`}</td>
                      <td><GorevTipBadge t={g.tip} /></td>
                      <td><GorevDurumBadge s={g.durum} /></td>
                      <td style={{ fontSize: 12 }}>{lastPin ? PIN_LABEL[lastPin.tip] || lastPin.tip : '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{lastPin ? fmtDT(lastPin.at) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      {cagriOpen && (
        <CagriModal
          onClose={() => setCagriOpen(false)}
          stations={stations}
          vehicles={sorted}
          gorevler={gorevler}
          distances={distances}
          routes={routes}
          busy={busy}
          onSubmit={cagriYap}
        />
      )}
      {gorevVer && (
        <GorevVerModal
          v={gorevVer}
          onClose={() => setGorevVer(null)}
          stations={stations}
          users={users}
          distances={distances}
          routes={routes}
        />
      )}
    </>
  );
}

/* ---------------- İstasyondan araç çağırma ---------------- */
function CagriModal({ onClose, stations, vehicles, gorevler, distances, routes, busy, onSubmit }: {
  onClose: () => void;
  stations: { id: string; code: string; name: string }[];
  vehicles: Vehicle[];
  gorevler: Gorev[];
  distances: Distance[];
  routes: RoutePlan[];
  busy: boolean;
  onSubmit: (stationId: string, vehicleId: string | null) => void;
}) {
  const [stationId, setStationId] = useState('');
  const [vehicleId, setVehicleId] = useState(''); // '' = en yakın boşta araç
  const aktif = vehicles.filter((v) => v.status === 'AKTIF');
  const stAd = (id?: string | null) => {
    const s = stations.find((x) => x.id === id);
    return s ? `${s.code} · ${s.name}` : 'bilinmiyor';
  };
  return (
    <Modal title="İstasyondan Araç Çağır" onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy} onClick={() => onSubmit(stationId, vehicleId || null)}>
            Çağrı Yap
          </button>
        </>
      }
    >
      <Note type="info">
        Görev varsayılan olarak <b>çağıran istasyona en yakın boşta araca</b> otomatik düşer;
        yönetici istersen aşağıdan aracı <b>elle seçebilir</b> (meşgul araç da seçilebilir).
      </Note>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Çağıran İstasyon <span className="req">*</span></label>
        <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
          {renderOpts(stations.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), stationId, '— İstasyon seçin —')}
        </select>
      </div>
      <div className="field">
        <label>Araç</label>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">En yakın boşta araç (otomatik)</option>
          {aktif.map((v) => {
            const bos = isBosArac(v.id, gorevler);
            const konum = aracinStasyonu(v, gorevler);
            const km = stationId ? enKisaKm(distances, routes, konum, stationId) : null;
            return <option key={v.id} value={v.id}>
              {v.code}{v.name ? ` · ${v.name}` : ''} — {stAd(konum)}{km != null ? ` (${fmtKm(km)})` : ''}{bos ? ' — boşta' : ' — meşgul'}
            </option>;
          })}
        </select>
      </div>
    </Modal>
  );
}

/* ---------------- Araca görev verme (sabit hat) ---------------- */
function GorevVerModal({ v, onClose, stations, users, distances, routes }: {
  v: Vehicle;
  onClose: () => void;
  stations: { id: string; code: string; name: string }[];
  users: (UserProfile & { uid: string })[];
  distances: Distance[];
  routes: RoutePlan[];
}) {
  const toast = useToast();
  const [fromId, setFromId] = useState(v.sabitFromId || '');
  const [toId, setToId] = useState(v.sabitToId || '');
  const [dolu, setDolu] = useState(true);
  const [busy, setBusy] = useState(false);
  const sofor = users.find((u) => u.role === 'sofor' && u.vehicleId === v.id);
  const atayan = 'Yönetim';

  async function save() {
    if (!fromId || !toId) { toast('Nereden ve nereye seçin.', 'error'); return; }
    if (fromId === toId) { toast('Nereden ve nereye farklı olmalı.', 'error'); return; }
    setBusy(true);
    try {
      await createGorev({
        vehicleId: v.id, tip: 'HAT', fromId, toId, dolu,
        km: enKisaKm(distances, routes, fromId, toId),
        soforUid: sofor?.uid || null, soforAd: sofor?.displayName || null,
        not: `${atayan} atadı`,
      });
      toast(`Görev düşürüldü → ${v.code}`);
      onClose();
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Görev Ver — ${v.code}`} onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy} onClick={save}>Görevi Düşür</button>
        </>
      }
    >
      <Note type="info">
        {sofor ? `Görev ${sofor.displayName} adlı şoförün panelinde görünecek.` : 'Bu araca şoför atanmamış — görev yine de panelde görünür (araca atanan şoför olursa o görür).'}
      </Note>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Nereden (yükleme) <span className="req">*</span></label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {renderOpts(stations.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), fromId)}
          </select>
        </div>
        <div className="field">
          <label>Nereye (boşaltma) <span className="req">*</span></label>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            {renderOpts(stations.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), toId)}
          </select>
        </div>
      </div>
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={dolu} onChange={(e) => setDolu(e.target.checked)} style={{ width: 16, height: 16 }} />
          Dolu gidiyor (yük var) — işaretlenmezse boş hareket sayılır
        </label>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
        Durum akışı: Yeni görev → Dolu yola çıktım → Vardım (dolu / yer boş) → Hedef istasyona yola çıktım (dönüş) →
        Hedef istasyona vardım → Yükleme tamam (yeni tur). Şoför pinleri Araç Takip sayfasında canlı izlenir.
      </div>
    </Modal>
  );
}
