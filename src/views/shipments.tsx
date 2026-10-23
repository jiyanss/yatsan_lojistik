'use client';
// Sevkiyatlar — dış tedarikçilerden gelen ve sevkiyat deposundan çıkan yükler
import { useMemo, useState } from 'react';
import { add, nextNo, remove, today, update } from '@/lib/db';
import { SHIP_STATUS, fbErr } from '@/lib/constants';
import { fmtDate, matchText, upperTr } from '@/lib/format';
import { exportCSV } from '@/lib/csv';
import type { Shipment, Station } from '@/lib/types';
import Icon from '@/components/Icon';
import { DirectionBadge, EmptyState, Modal, ShipStatusBadge, confirmDialog } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections, useDebounced } from '@/hooks/useData';
import type { ViewCtx } from './context';

const NEXT: Record<string, 'YOLDA' | 'TAMAMLANDI'> = { PLANLANDI: 'YOLDA', YOLDA: 'TAMAMLANDI' };

export default function ShipmentsView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const data = useCollections(['shipments', 'stations']);
  const [filters, setFilters] = useState({ direction: '', status: '', q: '', from: '', to: '' });
  const [qInput, setQInput] = useState('');
  const [form, setForm] = useState<Shipment | 'new' | null>(null);

  const qFilter = { ...filters, q: useDebounced(qInput, 220) };

  const shipments = (data?.shipments || null) as Shipment[] | null;
  const stations = (data?.stations || []) as Station[];
  const stById = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);

  const sorted = useMemo(() => {
    if (!shipments) return [];
    return [...shipments].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [shipments]);

  const filtered = useMemo(() => sorted.filter((s) =>
    (!qFilter.direction || s.direction === qFilter.direction) &&
    (!qFilter.status || s.status === qFilter.status) &&
    (!qFilter.from || s.date >= qFilter.from) &&
    (!qFilter.to || s.date <= qFilter.to) &&
    (matchText(s.no, qFilter.q) || matchText(s.partner, qFilter.q) || matchText(s.plate, qFilter.q) || matchText(s.qty, qFilter.q))
  ), [sorted, qFilter]);

  if (!shipments) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Ara: no, firma, plaka…" style={{ minWidth: 170 }}
          value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}>
          <option value="">Tümü</option>
          <option value="GELEN">Gelen (tedarikçi)</option>
          <option value="GIDEN">Giden (müşteri)</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tüm durumlar</option>
          {Object.entries(SHIP_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <label className="inline">Başlangıç <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="inline">Bitiş <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <span className="spacer" />
        <button className="btn secondary" onClick={() => exportCSV(`sevkiyatlar_${today()}`,
          ['No', 'Yön', 'Firma', 'Tarih', 'Kaynak', 'Hedef', 'Yük', 'Palet', 'Plaka', 'Durum', 'Not'],
          filtered.map((s) => [s.no, s.direction === 'GELEN' ? 'Gelen' : 'Giden', s.partner, s.date,
            s.fromId ? (stById[s.fromId] as Station | undefined)?.name || '' : 'Dış',
            s.toId ? (stById[s.toId] as Station | undefined)?.name || '' : 'Dış',
            s.qty, s.pallets ?? '', s.plate, SHIP_STATUS[s.status] || '', s.note]))
        }><Icon name="download" size={15} /> CSV</button>
        {ctx.canEdit && <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> Yeni Sevkiyat</button>}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 9 }}>
        {filtered.length} sevkiyat listeleniyor (toplam {sorted.length})
      </div>

      <div className="card"><div className="card-body flush">
        {!filtered.length ? (
          <EmptyState
            ico="package" title={sorted.length ? 'Filtreye uyan sevkiyat yok' : 'Henüz sevkiyat kaydı yok'}
            desc={sorted.length ? 'Filtreleri değiştirerek tekrar deneyin.' : 'Dış tedarikçilerden gelen ve sevkiyat deposundan müşterilere çıkan yükleri burada takip edin.'}
            action={ctx.canEdit && !sorted.length
              ? <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> İlk sevkiyatı ekle</button>
              : undefined}
          />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th>No</th><th>Yön</th><th>Firma</th><th>Tarih</th><th>Rota</th><th>Yük</th><th className="num">Palet</th><th>Plaka</th><th>Durum</th><th className="actions">İşlem</th>
            </tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={s.status === 'IPTAL' ? 'dim' : ''}>
                  <td><b>{s.no}</b></td>
                  <td><DirectionBadge d={s.direction} /></td>
                  <td>{s.partner || '—'}</td>
                  <td>{fmtDate(s.date)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s.fromId ? (stById[s.fromId] as Station | undefined)?.code || '?' : 'Dış'}
                    {' '}<Icon name="arrowRight" size={12} />{' '}
                    {s.toId ? (stById[s.toId] as Station | undefined)?.code || '?' : 'Dış'}
                  </td>
                  <td>{s.qty || ''}</td>
                  <td className="num">{s.pallets ?? '—'}</td>
                  <td>{s.plate || '—'}</td>
                  <td><ShipStatusBadge s={s.status} /></td>
                  <td className="actions">
                    {ctx.canEdit ? (
                      <>
                        <button className="btn sm secondary" title="Düzenle" onClick={() => setForm(s)}><Icon name="pencil" size={13} /></button>
                        {s.status !== 'TAMAMLANDI' && s.status !== 'IPTAL' && (
                          <button className="btn sm ok" title="İleri durum" onClick={async () => {
                            const next = NEXT[s.status] || 'TAMAMLANDI';
                            try {
                              await update('shipments', s.id, { status: next });
                              toast(`${s.no}: durum "${SHIP_STATUS[next]}" olarak güncellendi`);
                            } catch (e) { toast(fbErr(e), 'error'); }
                          }}><Icon name="check" size={13} /></button>
                        )}
                        {s.status !== 'IPTAL' && s.status !== 'TAMAMLANDI' && (
                          <button className="btn sm danger-ghost" title="İptal" onClick={async () => {
                            if (!await confirmDialog('Sevkiyat iptal edilecek.', { okText: 'İptal Et' })) return;
                            try { await update('shipments', s.id, { status: 'IPTAL' }); toast('Sevkiyat iptal edildi'); }
                            catch (e) { toast(fbErr(e), 'error'); }
                          }}><Icon name="ban" size={13} /></button>
                        )}
                      </>
                    ) : <ShipStatusBadge s={s.status} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {form && (
        <ShipmentForm
          initial={form === 'new' ? null : form}
          stations={stations}
          canEdit={ctx.canEdit}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

function ShipmentForm({ initial, stations, canEdit, onClose }: {
  initial: Shipment | null; stations: Station[]; canEdit: boolean; onClose: () => void;
}) {
  const toast = useToast();
  const activeSt = stations.filter((x) => x.active !== false);
  const [f, setF] = useState({
    direction: initial?.direction || 'GELEN',
    date: initial?.date || today(),
    partner: initial?.partner || '',
    fromId: initial?.fromId || '',
    toId: initial?.toId || '',
    qty: initial?.qty || '',
    pallets: initial?.pallets != null ? String(initial.pallets) : '',
    plate: initial?.plate || '',
    status: initial?.status || 'PLANLANDI',
    note: initial?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.partner || !f.date) { toast('Firma ve tarih zorunludur.', 'error'); return; }
    setBusy(true);
    const data = {
      direction: f.direction as 'GELEN' | 'GIDEN',
      date: f.date,
      partner: f.partner.trim(),
      fromId: f.fromId || null,
      toId: f.toId || null,
      qty: f.qty.trim(),
      pallets: f.pallets ? Number(f.pallets) : null,
      plate: upperTr(f.plate.trim()),
      status: f.status as Shipment['status'],
      note: f.note.trim(),
    };
    try {
      if (initial) {
        await update('shipments', initial.id, data);
        toast('Sevkiyat güncellendi');
      } else {
        const no = await nextNo('shipments', 'SVK');
        await add('shipments', { ...data, no });
        toast(`Sevkiyat oluşturuldu (${no})`);
      }
      onClose();
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={initial ? `Sevkiyat ${initial.no}` : 'Yeni Sevkiyat'}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Kapat</button>
          {canEdit && <button className="btn" onClick={save} disabled={busy}>Kaydet</button>}
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Yön <span className="req">*</span></label>
          <select value={f.direction} onChange={set('direction')} disabled={!canEdit}>
            <option value="GELEN">Gelen (tedarikçiden)</option>
            <option value="GIDEN">Giden (müşteriye)</option>
          </select>
        </div>
        <div className="field">
          <label>Tarih <span className="req">*</span></label>
          <input type="date" value={f.date} onChange={set('date')} disabled={!canEdit} />
        </div>
      </div>
      <div className="field">
        <label>Firma (tedarikçi / müşteri) <span className="req">*</span></label>
        <input value={f.partner} onChange={set('partner')} placeholder="Örn. Süngerci A.Ş." disabled={!canEdit} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Kaynak (opsiyonel)</label>
          <select value={f.fromId} onChange={set('fromId')} disabled={!canEdit}>
            <option value="">Dış nokta</option>
            {activeSt.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Hedef (opsiyonel)</label>
          <select value={f.toId} onChange={set('toId')} disabled={!canEdit}>
            <option value="">Dış nokta</option>
            {activeSt.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Yük açıklaması</label>
          <input value={f.qty} onChange={set('qty')} placeholder="Örn. Sünger blok" disabled={!canEdit} />
        </div>
        <div className="field">
          <label>Palet adedi</label>
          <input type="number" min={0} value={f.pallets} onChange={set('pallets')} placeholder="12" disabled={!canEdit} />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Dış araç plakası</label>
          <input value={f.plate} onChange={set('plate')} placeholder="34 ABC 123" disabled={!canEdit} />
        </div>
        <div className="field">
          <label>Durum</label>
          <select value={f.status} onChange={set('status')} disabled={!canEdit}>
            {Object.entries(SHIP_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Not</label>
        <textarea value={f.note} onChange={set('note')} disabled={!canEdit} />
      </div>
    </Modal>
  );
}
