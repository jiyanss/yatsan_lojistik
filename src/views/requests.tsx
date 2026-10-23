'use client';
// Araç Talepleri — istasyonların araç hizmeti talepleri
import { useMemo, useState } from 'react';
import { add, nextNo, remove, today, update } from '@/lib/db';
import { PRIORITY, REQ_STATUS, fbErr } from '@/lib/constants';
import { fmtDate, matchText, upperTr } from '@/lib/format';
import { exportCSV } from '@/lib/csv';
import type { Station, TransportRequest } from '@/lib/types';
import Icon from '@/components/Icon';
import { EmptyState, Modal, PriorityBadge, ReqStatusBadge, confirmDialog, renderOpts } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections, useDebounced } from '@/hooks/useData';
import type { ViewCtx } from './context';

const emptyFilters = { status: '', priority: '', station: '', from: '', to: '', q: '' };

export default function RequestsView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const data = useCollections(['requests', 'stations']);
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [qInput, setQInput] = useState('');
  const [form, setForm] = useState<TransportRequest | 'new' | null>(null);

  const debouncedQ = useDebounced(qInput, 220);
  const qFilter = { ...filters, q: debouncedQ };

  const requests = (data?.requests || null) as TransportRequest[] | null;
  const stations = (data?.stations || []) as Station[];

  const sorted = useMemo(() => {
    if (!requests) return [];
    return [...requests].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [requests]);

  const filtered = useMemo(() => {
    return sorted.filter((r) =>
      (!qFilter.status || r.status === qFilter.status) &&
      (!qFilter.priority || r.priority === qFilter.priority) &&
      (!qFilter.station || r.requesterId === qFilter.station || r.fromId === qFilter.station || r.toId === qFilter.station) &&
      (!qFilter.from || r.date >= qFilter.from) &&
      (!qFilter.to || r.date <= qFilter.to) &&
      (matchText(r.no, qFilter.q) || matchText(r.material, qFilter.q) || matchText(r.note, qFilter.q) || matchText(r.qty, qFilter.q))
    );
  }, [sorted, qFilter]);

  const stById = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);

  async function approve(r: TransportRequest) {
    try { await update('requests', r.id, { status: 'ONAYLANDI' }); toast('Talep onaylandı'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }
  async function cancel(r: TransportRequest) {
    if (!await confirmDialog('Talep iptal edilecek.', { okText: 'İptal Et' })) return;
    try { await update('requests', r.id, { status: 'IPTAL' }); toast('Talep iptal edildi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }
  async function del(r: TransportRequest) {
    if (!await confirmDialog('Talep kalıcı olarak silinecek.')) return;
    try { await remove('requests', r.id); toast('Talep silindi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }

  function csv() {
    exportCSV(`talepler_${today()}`,
      ['No', 'Tarih', 'Talep Eden', 'Kaynak', 'Hedef', 'Malzeme', 'Miktar', 'Öncelik', 'Durum', 'Not'],
      filtered.map((r) => [
        r.no, r.date,
        (stById[r.requesterId] as Station | undefined)?.name || '',
        (stById[r.fromId] as Station | undefined)?.name || '',
        (stById[r.toId] as Station | undefined)?.name || '',
        r.material, r.qty, PRIORITY[r.priority] || '', REQ_STATUS[r.status] || '', r.note,
      ]));
  }

  if (!requests) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Ara: no, malzeme…" style={{ minWidth: 160 }}
          value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tüm durumlar</option>
          {Object.entries(REQ_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">Tüm öncelikler</option>
          {Object.entries(PRIORITY).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select value={filters.station} onChange={(e) => setFilters({ ...filters, station: e.target.value })}>
          <option value="">Tüm istasyonlar</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
        </select>
        <label className="inline">Başlangıç <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="inline">Bitiş <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <span className="spacer" />
        <button className="btn secondary" onClick={csv}><Icon name="download" size={15} /> CSV</button>
        {ctx.canEdit && <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> Yeni Talep</button>}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 9 }}>
        {filtered.length} talep listeleniyor (toplam {sorted.length})
      </div>

      <div className="card"><div className="card-body flush">
        {!filtered.length ? (
          <EmptyState
            ico="clipboard" title={sorted.length ? 'Filtreye uyan talep yok' : 'Henüz araç talebi yok'}
            desc={sorted.length ? 'Filtreleri değiştirerek tekrar deneyin.' : 'İstasyonlar buradan araç talebi açar: hangi istasyondan hangi istasyona hangi malzeme taşınacak.'}
            action={ctx.canEdit && !sorted.length
              ? <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> İlk talebi oluştur</button>
              : undefined}
          />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th>No</th><th>Tarih</th><th>Talep Eden</th><th>Hat</th><th>Malzeme</th><th>Miktar</th><th>Öncelik</th><th>Durum</th><th className="actions">İşlem</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const from = stById[r.fromId] as Station | undefined;
                const to = stById[r.toId] as Station | undefined;
                const rq = stById[r.requesterId] as Station | undefined;
                const open = ['BEKLEMEDE', 'ONAYLANDI'].includes(r.status);
                return (
                  <tr key={r.id} className={r.status === 'IPTAL' ? 'dim' : ''}>
                    <td><b>{r.no}</b></td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{rq ? `${rq.code} · ${rq.name}` : '?'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {from ? from.code : '?'} <Icon name="arrowRight" size={12} /> {to ? to.code : '?'}
                    </td>
                    <td>
                      {r.material || ''}
                      {r.note ? <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.note}</div> : null}
                    </td>
                    <td>{r.qty || ''}</td>
                    <td><PriorityBadge p={r.priority} /></td>
                    <td><ReqStatusBadge s={r.status} /></td>
                    <td className="actions">
                      {ctx.canEdit ? (
                        <>
                          {r.status === 'BEKLEMEDE' && (
                            <button className="btn sm ok" title="Onayla" onClick={() => approve(r)}><Icon name="check" size={13} /></button>
                          )}
                          <button className="btn sm secondary" title={open ? 'Düzenle' : 'Görüntüle'} onClick={() => setForm(r)}>
                            <Icon name="pencil" size={13} />
                          </button>
                          {open && (
                            <button className="btn sm danger-ghost" title="İptal" onClick={() => cancel(r)}><Icon name="ban" size={13} /></button>
                          )}
                          {['BEKLEMEDE', 'IPTAL'].includes(r.status) && (
                            <button className="btn sm danger-ghost" title="Sil" onClick={() => del(r)}><Icon name="trash" size={13} /></button>
                          )}
                        </>
                      ) : <ReqStatusBadge s={r.status} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div></div>

      {form && (
        <RequestForm
          initial={form === 'new' ? null : form}
          stations={stations}
          canEdit={ctx.canEdit}
          createdBy={ctx.user?.displayName || ''}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

/* ---------------- Talep formu ---------------- */
function RequestForm({ initial, stations, canEdit, createdBy, onClose }: {
  initial: TransportRequest | null;
  stations: Station[];
  canEdit: boolean;
  createdBy: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const activeSt = stations.filter((s) => s.active !== false);
  const editable = canEdit && (!initial || !['PLANLANDI', 'TAMAMLANDI'].includes(initial.status));

  const [f, setF] = useState({
    requesterId: initial?.requesterId || '',
    date: initial?.date || today(),
    fromId: initial?.fromId || '',
    toId: initial?.toId || '',
    material: initial?.material || '',
    qty: initial?.qty || '',
    priority: initial?.priority || 'NORMAL',
    status: initial?.status || 'BEKLEMEDE',
    note: initial?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.requesterId || !f.fromId || !f.toId || !f.material || !f.date) {
      toast('Zorunlu alanları doldurun.', 'error'); return;
    }
    if (f.fromId === f.toId) { toast('Kaynak ve hedef istasyon aynı olamaz.', 'error'); return; }
    setBusy(true);
    try {
      if (initial) {
        await update('requests', initial.id, { ...f });
        toast('Talep güncellendi');
      } else {
        const no = await nextNo('requests', 'TKP');
        await add('requests', { ...f, no, createdBy });
        toast(`Talep oluşturuldu (${no})`);
      }
      onClose();
    } catch (e) {
      toast(fbErr(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial ? `Talep ${initial.no}` : 'Yeni Araç Talebi'}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Kapat</button>
          {editable && <button className="btn" onClick={save} disabled={busy}>Kaydet</button>}
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Talep Eden İstasyon <span className="req">*</span></label>
          <select value={f.requesterId} onChange={set('requesterId')} disabled={!editable}>
            {renderOpts(activeSt.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), f.requesterId)}
          </select>
        </div>
        <div className="field">
          <label>Tarih <span className="req">*</span></label>
          <input type="date" value={f.date} onChange={set('date')} disabled={!editable} />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Kaynak İstasyon (nereden) <span className="req">*</span></label>
          <select value={f.fromId} onChange={set('fromId')} disabled={!editable}>
            {renderOpts(activeSt.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), f.fromId)}
          </select>
        </div>
        <div className="field">
          <label>Hedef İstasyon (nereye) <span className="req">*</span></label>
          <select value={f.toId} onChange={set('toId')} disabled={!editable}>
            {renderOpts(activeSt.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), f.toId)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Malzeme / Yük <span className="req">*</span></label>
        <input value={f.material} onChange={set('material')} placeholder="Örn. Kumaş ruloları" disabled={!editable} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Miktar</label>
          <input value={f.qty} onChange={set('qty')} placeholder="Örn. 12 palet" disabled={!editable} />
        </div>
        <div className="field">
          <label>Öncelik</label>
          <select value={f.priority} onChange={set('priority')} disabled={!editable}>
            {Object.entries(PRIORITY).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      {editable && (
        <div className="field">
          <label>Durum</label>
          <select value={f.status} onChange={set('status')}>
            {Object.entries(REQ_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Not</label>
        <textarea value={f.note} onChange={set('note')} disabled={!editable} />
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>
        Talep no: {initial?.no || upperTr('otomatik (TKP-####)')} · Kayıt: {initial ? fmtDate(initial.createdAt as string) : 'yeni'}
      </p>
    </Modal>
  );
}
