'use client';
// İstasyonlar & Depolar + Mesafe Matrisi
import { useMemo, useState } from 'react';
import { add, distanceBetween, remove, saveDistance, update } from '@/lib/db';
import { STATION_TYPES, fbErr } from '@/lib/constants';
import { fmtKm, matchText, upperTr } from '@/lib/format';
import type { Distance, RoutePlan, Shipment, Station, StationType, TransportRequest } from '@/lib/types';
import Icon from '@/components/Icon';
import { EmptyState, Modal, Note, StationTypeBadge, confirmDialog } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function StationsView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const data = useCollections(['stations', 'distances', 'requests', 'routes', 'vehicles', 'shipments']);
  const [tab, setTab] = useState<'list' | 'matrix'>('list');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Station | 'new' | null>(null);
  const [distPair, setDistPair] = useState<[Station, Station] | null>(null);

  const stations = (data?.stations || null) as Station[] | null;
  const distances = (data?.distances || []) as Distance[];
  const sorted = useMemo(() => {
    if (!stations) return [];
    return [...stations].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr'));
  }, [stations]);

  const usedIds = useMemo(() => {
    if (!data) return new Set<string>();
    const reqs = (data.requests || []) as TransportRequest[];
    const rts = (data.routes || []) as RoutePlan[];
    const ships = (data.shipments || []) as Shipment[];
    return new Set<string>([
      ...reqs.flatMap((r) => [r.requesterId, r.fromId, r.toId]),
      ...rts.flatMap((r) => [r.startStationId, ...(r.stops || []).map((s) => s.stationId)]),
      ...ships.flatMap((s) => [s.fromId, s.toId].filter(Boolean) as string[]),
    ]);
  }, [data]);

  if (!stations) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  const listFiltered = sorted.filter((s) =>
    matchText(s.code, search) || matchText(s.name, search) || matchText(STATION_TYPES[s.type], search));

  async function del(s: Station) {
    if (!await confirmDialog(<><b>{s.name}</b> istasyonu silinecek. Bu işlem geri alınamaz.</>)) return;
    try { await remove('stations', s.id); toast('İstasyon silindi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }

  return (
    <>
      <div className="tabs">
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          <Icon name="building" size={15} /> İstasyonlar ({sorted.length})
        </button>
        <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>
          <Icon name="layers" size={15} /> Mesafe Matrisi
        </button>
      </div>

      {tab === 'list' ? (
        <>
          <div className="toolbar">
            <input type="search" placeholder="Ara: kod, ad…" style={{ minWidth: 200 }}
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="spacer" />
            {ctx.canEdit && (
              <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> Yeni İstasyon</button>
            )}
          </div>
          <div className="card"><div className="card-body flush">
            {!listFiltered.length ? (
              <EmptyState
                ico="mappin" title={sorted.length ? 'Sonuç bulunamadı' : 'Henüz istasyon tanımlanmamış'}
                desc={sorted.length
                  ? 'Arama kriterlerinize uygun istasyon yok.'
                  : 'Merkez depo, yatak depo, sevkiyat deposu, üretim istasyonları ve dış tedarikçilerinizi tanımlayın. Mesafeler Mesafe Matrisi sekmesinden girilir.'}
                action={ctx.canEdit && !sorted.length
                  ? <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> İlk istasyonu ekle</button>
                  : undefined}
              />
            ) : (
              <div className="table-wrap"><table className="tbl">
                <thead><tr>
                  <th>Kod</th><th>Ad</th><th>Tip</th><th className="num">Bağlı hat</th><th>Not</th><th>Durum</th><th className="actions">İşlem</th>
                </tr></thead>
                <tbody>
                  {listFiltered.map((s) => {
                    const used = usedIds.has(s.id);
                    return (
                      <tr key={s.id} className={s.active === false ? 'dim' : ''}>
                        <td><b>{s.code}</b></td>
                        <td>{s.name}</td>
                        <td><StationTypeBadge t={s.type} /></td>
                        <td className="num">{used ? 'Var' : '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{s.note || ''}</td>
                        <td>{s.active === false
                          ? <span className="badge st-iptal">Pasif</span>
                          : <span className="badge st-tamamlandi">Aktif</span>}</td>
                        <td className="actions">
                          {ctx.canEdit ? (
                            <>
                              <button className="btn sm secondary" onClick={() => setForm(s)}><Icon name="pencil" size={13} /></button>
                              <button className="btn sm danger-ghost" title={used ? 'Kullanımda — silinemez, pasife alın' : 'Sil'}
                                disabled={used} onClick={() => del(s)}><Icon name="trash" size={13} /></button>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div></div>
        </>
      ) : (
        <MatrixTab ctx={ctx} stations={sorted} distances={distances} onPick={(a, b) => setDistPair([a, b])} />
      )}

      {form && (
        <StationForm
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
        />
      )}

      {distPair && (
        <DistanceForm
          a={distPair[0]} b={distPair[1]}
          current={distanceBetween(distances, distPair[0].id, distPair[1].id)}
          onClose={() => setDistPair(null)}
        />
      )}
    </>
  );
}

/* ---------------- Mesafe matrisi ---------------- */
function MatrixTab({ ctx, stations, distances, onPick }: {
  ctx: ViewCtx; stations: Station[]; distances: Distance[];
  onPick: (a: Station, b: Station) => void;
}) {
  const act = stations.filter((s) => s.active !== false);
  if (act.length < 2) {
    return (
      <div className="card"><div className="card-body">
        <EmptyState ico="layers" title="Mesafe matrisi için en az 2 istasyon gerekli"
          desc="Önce İstasyonlar sekmesinden istasyonlarınızı tanımlayın." />
      </div></div>
    );
  }
  const get = (a: Station, b: Station) => distanceBetween(distances, a.id, b.id);
  let missing = 0;
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) if (get(act[i], act[j]) == null) missing++;
  }

  return (
    <>
      {missing > 0 ? (
        <Note type="warn">
          <b>{missing} çift</b> için mesafe tanımlanmamış. Tanımsız mesafeli hatlar rota planında toplam km&apos;ye sayılmaz ve uyarı verir. Hücreye tıklayarak mesafe girin (iki yönlü kaydedilir).
        </Note>
      ) : (
        <Note type="ok">Tüm istasyon çiftleri için mesafeler tanımlı.</Note>
      )}
      <div className="card">
        <div className="card-head">
          <h3>İstasyonlar arası mesafe (metre)</h3>
          <span className="hint">{ctx.canEdit ? 'Düzenlemek için hücreye tıklayın' : 'Yalnızca görüntüleme'}</span>
        </div>
        <div className="card-body flush">
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="corner">İstasyon</th>
                  {act.map((s) => <th key={s.id} title={s.name}>{s.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {act.map((a) => (
                  <tr key={a.id}>
                    <td className="stname">{a.code} · {a.name}</td>
                    {act.map((b) => {
                      if (a.id === b.id) return <td key={b.id} className="cell self"><span className="diag" /></td>;
                      const m = get(a, b);
                      return (
                        <td key={b.id}
                          className={`cell ${m != null ? 'has' : 'miss'} ${ctx.canEdit ? '' : 'ro'}`}
                          onClick={ctx.canEdit ? () => onPick(a, b) : undefined}
                        >
                          {m != null ? fmtKm(m) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- Mesafe formu ---------------- */
function DistanceForm({ a, b, current, onClose }: {
  a: Station; b: Station; current: number | null; onClose: () => void;
}) {
  const toast = useToast();
  const [meters, setMeters] = useState(current != null ? String(current) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = Number(meters);
    if (meters === '' || isNaN(v) || v < 0) { toast('Geçerli bir mesafe girin.', 'error'); return; }
    setBusy(true);
    try { await saveDistance(a.id, b.id, v); toast('Mesafe kaydedildi'); onClose(); }
    catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }
  async function del() {
    setBusy(true);
    try { await saveDistance(a.id, b.id, null); toast('Mesafe silindi'); onClose(); }
    catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Mesafe Tanımla" onClose={onClose}
      footer={
        <>
          {current != null && <button className="btn danger-ghost" onClick={del} disabled={busy}>Sil</button>}
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={save} disabled={busy}>Kaydet</button>
        </>
      }
    >
      <Note type="info">
        <b>{a.name}</b> ↔ <b>{b.name}</b> arasındaki gerçek saha mesafesini metre cinsinden girin. Değer iki yönlü olarak kaydedilir.
      </Note>
      <div className="field">
        <label>Mesafe (metre) <span className="req">*</span></label>
        <input type="number" min={0} step={1} placeholder="Örn. 250" value={meters}
          onChange={(e) => setMeters(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}

/* ---------------- İstasyon formu ---------------- */
function StationForm({ initial, onClose }: { initial: Station | null; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    type: (initial?.type || 'MERKEZ_DEPO') as StationType,
    note: initial?.note || '',
    active: initial?.active !== false,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const code = upperTr(f.code.trim());
    if (!code || !f.name.trim()) { toast('Kod ve ad zorunludur.', 'error'); return; }
    setBusy(true);
    const data = { code, name: f.name.trim(), type: f.type, note: f.note.trim(), active: f.active };
    try {
      if (initial) { await update('stations', initial.id, data); toast('İstasyon güncellendi'); }
      else { await add('stations', data); toast('İstasyon eklendi'); }
      onClose();
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={initial ? 'İstasyonu Düzenle' : 'Yeni İstasyon'} onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={save} disabled={busy}>Kaydet</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Kod <span className="req">*</span></label>
          <input maxLength={8} placeholder="MRZ" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </div>
        <div className="field">
          <label>Tip <span className="req">*</span></label>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as StationType })}>
            {Object.entries(STATION_TYPES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Ad <span className="req">*</span></label>
        <input placeholder="Merkez Depo" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="field">
        <label>Not</label>
        <textarea placeholder="İsteğe bağlı açıklama" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <div className="check-row">
        <input type="checkbox" id="st-active" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <label htmlFor="st-active" style={{ margin: 0, fontWeight: 600 }}>Aktif</label>
      </div>
    </Modal>
  );
}
